/* طبقة البيانات: الإعدادات، الفئات وأسئلتها، المباريات.
   كل قواعد العمل المتعلقة بالمحتوى تُفرض هنا وليس في الواجهة فقط */
(function (SJ) {
  'use strict';

  const { db, utils, AppError } = SJ;
  const engine = SJ.engine;

  /* ---------- الإعدادات ---------- */
  const SETTINGS_DEFAULTS = Object.freeze({ timerSeconds: 30, sounds: true, deductOnWrong: false, allowSteal: true });

  function sanitizeSettings(raw) {
    const s = Object.assign({}, SETTINGS_DEFAULTS);
    if (raw && SJ.config.TIMER_OPTIONS.includes(Number(raw.timerSeconds))) s.timerSeconds = Number(raw.timerSeconds);
    ['sounds', 'deductOnWrong', 'allowSteal'].forEach((k) => {
      if (raw && typeof raw[k] === 'boolean') s[k] = raw[k];
    });
    return s;
  }

  const Settings = {
    DEFAULTS: SETTINGS_DEFAULTS,
    sanitize: sanitizeSettings,
    async load() {
      const rec = await db.get('kv', 'settings');
      SJ.state.settings = sanitizeSettings(rec && rec.value);
      return SJ.state.settings;
    },
    get() {
      return SJ.state.settings || Object.assign({}, SETTINGS_DEFAULTS);
    },
    async update(patch) {
      const next = sanitizeSettings(Object.assign({}, this.get(), patch));
      await db.put('kv', { key: 'settings', value: next });
      SJ.state.settings = next;
      SJ.events.emit('settings', next);
      return next;
    },
  };

  /* ---------- المباريات ---------- */
  const Matches = {
    get: (id) => db.get('matches', id),
    getAll: () => db.getAll('matches'),
    async save(match) {
      await db.put('matches', match);
      return match;
    },
    async getActive() {
      const list = await db.byIndex('matches', 'status', 'playing');
      list.sort((a, b) => b.startedAt - a.startedAt);
      return list[0] || null;
    },
    // معرّفات الفئات المستخدمة في مباريات جارية (لمنع تعديلها أو حذفها)
    async inUseCategoryIds() {
      const list = await db.byIndex('matches', 'status', 'playing');
      const ids = new Set();
      list.forEach((m) => {
        m.categoryIds.forEach((id) => ids.add(id));
        if (m.tiebreaker) ids.add(m.tiebreaker.categoryId);
      });
      return ids;
    },
    // إنهاء كل المباريات الجارية دون نتيجة (عند اختيار «بدء مباراة جديدة»)
    async abandonActive() {
      const list = await db.byIndex('matches', 'status', 'playing');
      for (const m of list) await db.put('matches', engine.finish(m, 'abandoned'));
      return list.length;
    },
    async countPlayed() {
      const all = await db.getAll('matches');
      return all.filter((m) => m.status === 'finished' && m.endReason !== 'abandoned' && m.history.some((h) => h.type === 'answer')).length;
    },
    // آخر وقت ظهر فيه كل سؤال على لوحة مباراة، لتفضيل الأسئلة التي لم تُلعب مؤخرًا
    async lastSeenMap() {
      const map = {};
      (await db.getAll('matches')).forEach((m) => {
        m.board.forEach((col) => col.slots.forEach((s) => {
          map[s.questionId] = Math.max(map[s.questionId] || 0, m.startedAt);
        }));
      });
      return map;
    },
    // إنشاء مباراة من فئات جاهزة: سؤالان من كل مستوى يُسحبان من بنك كل فئة
    // مع لقطة من الإعدادات الحالية
    async create({ mode, players, categoryIds }) {
      if (await this.getActive()) throw new AppError('MATCH_ACTIVE');
      const playable = await Categories.listPlayable();
      const cats = categoryIds.map((id) => playable.find((c) => c.id === id));
      if (!cats.length || cats.some((c) => !c)) {
        throw new AppError('VALIDATION', 'إحدى الفئات المختارة لم تعد جاهزة للعب. اختر الفئات من جديد.');
      }
      const s = Settings.get();
      const lastSeen = await this.lastSeenMap();
      const match = engine.createMatch({
        id: utils.uid('m'),
        code: utils.matchCode(),
        mode,
        players: players.map((p) => ({ name: utils.normalize(p.name), color: p.color })),
        board: cats.map((c) => ({
          categoryId: c.id,
          name: c.name,
          color: c.color || null,
          imageId: c.image,
          slots: engine.pickBoardSlots(c.questions, { lastSeen }),
        })),
        settings: { timerSeconds: s.timerSeconds, deductOnWrong: s.deductOnWrong, allowSteal: s.allowSteal },
        now: Date.now(),
      });
      await this.save(match);
      return match;
    },
  };

  /* ---------- الفئات والأسئلة ---------- */
  // مستوى السؤال: من حقل النقاط، أو من الترتيب في البيانات القديمة (قبل بنك الأسئلة)
  function levelOf(q) {
    const p = Number(q.points);
    if (engine.LEVELS.includes(p)) return p;
    return engine.POINTS_BY_ORDER[q.order] || null;
  }

  const sortQuestions = (qs) => qs.slice().sort((a, b) => a.points - b.points || a.createdAt - b.createdAt);

  /* إضافة الحالة المحسوبة للفئة: عدد الأسئلة في كل مستوى، الناقص، الجاهزية، الاستخدام.
     الفئة جاهزة عندما يكون فيها صورة وسؤالان على الأقل من كل مستوى */
  function summarize(cat, questions, inUseIds) {
    const normalized = questions.map((q) => (q.points === levelOf(q) ? q : Object.assign({}, q, { points: levelOf(q) })));
    const levelCounts = engine.countByLevel(normalized);
    const missingLevels = engine.LEVELS
      .filter((p) => levelCounts[p] < engine.MIN_PER_LEVEL)
      .map((p) => ({ points: p, need: engine.MIN_PER_LEVEL - levelCounts[p] }));
    const hasImage = !!cat.image;
    const ready = missingLevels.length === 0 && hasImage;
    return Object.assign({}, cat, {
      questions: sortQuestions(normalized),
      questionCount: normalized.length,
      levelCounts,
      missingLevels,
      hasImage,
      ready,
      playable: ready && !!cat.isActive,
      inUse: inUseIds.has(cat.id),
    });
  }

  function cleanQuestion(q) {
    return {
      text: utils.normalizeMultiline(q.text),
      answer: utils.normalizeMultiline(q.answer),
      notes: utils.normalizeMultiline(q.notes),
      image: q.image || null,
      answerImage: q.answerImage || null,
      points: levelOf(q),
    };
  }

  const Categories = {
    async list() {
      const [cats, qs, inUse] = await Promise.all([db.getAll('categories'), db.getAll('questions'), Matches.inUseCategoryIds()]);
      const byCat = new Map();
      qs.forEach((q) => {
        if (!byCat.has(q.categoryId)) byCat.set(q.categoryId, []);
        byCat.get(q.categoryId).push(q);
      });
      return cats
        .map((c) => summarize(c, byCat.get(c.id) || [], inUse))
        .sort((a, b) => a.createdAt - b.createdAt);
    },

    async listPlayable() {
      return (await this.list()).filter((c) => c.playable);
    },

    async get(id) {
      const cat = await db.get('categories', id);
      if (!cat) return null;
      const [qs, inUse] = await Promise.all([db.byIndex('questions', 'categoryId', id), Matches.inUseCategoryIds()]);
      return summarize(cat, qs, inUse);
    },

    async assertNotInUse(id) {
      if ((await Matches.inUseCategoryIds()).has(id)) throw new AppError('CATEGORY_IN_USE');
    },

    /* حفظ الفئة مع أسئلتها وصورها في معاملة واحدة.
       questions: الأسئلة النهائية للفئة (ما لم يُذكر يُحذف)
       pendingImages: صور جديدة لم تُحفظ بعد (معرّف ← Blob) */
    async saveBundle({ category, questions = [], pendingImages = new Map(), isSample = undefined }) {
      const now = Date.now();
      const all = await db.getAll('categories');
      const existing = category.id ? all.find((c) => c.id === category.id) : null;
      if (category.id && !existing) throw new AppError('NOT_FOUND');
      if (existing) await this.assertNotInUse(existing.id);

      const data = {
        name: utils.normalize(category.name),
        description: utils.normalizeMultiline(category.description),
        color: category.color || null,
        image: category.image || null,
        isActive: category.isActive !== false,
      };
      const catErrors = SJ.validate.category(data, all.filter((c) => !existing || c.id !== existing.id).map((c) => c.name));
      if (SJ.validate.hasErrors(catErrors)) throw new AppError('VALIDATION', SJ.validate.firstError(catErrors), catErrors);

      // قاعدة بنك الأسئلة: حد أقصى لعدد الأسئلة في كل مستوى نقاط
      const cleaned = questions.map((q) => {
        const c = cleanQuestion(q);
        const errs = SJ.validate.question(c);
        if (SJ.validate.hasErrors(errs)) {
          throw new AppError('VALIDATION', `سؤال ${c.points || ''} نقطة: ${SJ.validate.firstError(errs)}`, errs);
        }
        return Object.assign({ id: q.id || null }, c);
      });
      const counts = engine.countByLevel(cleaned);
      if (engine.LEVELS.some((p) => counts[p] > engine.MAX_PER_LEVEL)) throw new AppError('CATEGORY_FULL');

      const id = existing ? existing.id : utils.uid('cat');
      const record = Object.assign({ id }, data, {
        isSample: isSample !== undefined ? !!isSample : !!(existing && existing.isSample),
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now,
      });

      const oldQuestions = existing ? await db.byIndex('questions', 'categoryId', id) : [];
      const keptIds = new Set(cleaned.filter((q) => q.id).map((q) => q.id));
      const removed = oldQuestions.filter((q) => !keptIds.has(q.id));
      const refsOf = (cat, qs) => [cat && cat.image].concat(...qs.map((q) => [q.image, q.answerImage])).filter(Boolean);
      const newRefs = new Set(refsOf(record, cleaned));
      const oldRefs = new Set(refsOf(existing, oldQuestions));
      const imagesToDelete = Array.from(oldRefs).filter((r) => !newRefs.has(r));
      const imagesToWrite = Array.from(newRefs).filter((r) => pendingImages.has(r));

      await db.tx(['categories', 'questions', 'images'], 'readwrite', (s) => {
        imagesToWrite.forEach((imgId) => s.images.put({ id: imgId, blob: pendingImages.get(imgId), createdAt: now }));
        s.categories.put(record);
        cleaned.forEach((q) => {
          const prev = oldQuestions.find((o) => o.id === q.id);
          s.questions.put({
            id: prev ? prev.id : utils.uid('q'),
            categoryId: id,
            text: q.text,
            answer: q.answer,
            notes: q.notes,
            image: q.image,
            answerImage: q.answerImage,
            points: q.points,
            createdAt: prev ? prev.createdAt : now,
            updatedAt: now,
          });
        });
        removed.forEach((q) => s.questions.delete(q.id));
        imagesToDelete.forEach((imgId) => s.images.delete(imgId));
      });
      imagesToDelete.forEach((imgId) => SJ.images.forget(imgId));
      return id;
    },

    async setActive(id, isActive) {
      await this.assertNotInUse(id);
      const cat = await db.get('categories', id);
      if (!cat) throw new AppError('NOT_FOUND');
      await db.put('categories', Object.assign({}, cat, { isActive: !!isActive, updatedAt: Date.now() }));
    },

    // حذف الفئة مع كل أسئلتها وصورها، ويعيد عدد الأسئلة المحذوفة
    async remove(id) {
      await this.assertNotInUse(id);
      const cat = await db.get('categories', id);
      if (!cat) throw new AppError('NOT_FOUND');
      const qs = await db.byIndex('questions', 'categoryId', id);
      const imageIds = [cat.image].concat(...qs.map((q) => [q.image, q.answerImage])).filter(Boolean);
      await db.tx(['categories', 'questions', 'images'], 'readwrite', (s) => {
        s.categories.delete(id);
        qs.forEach((q) => s.questions.delete(q.id));
        imageIds.forEach((imgId) => s.images.delete(imgId));
      });
      imageIds.forEach((imgId) => SJ.images.forget(imgId));
      return qs.length;
    },

    async stats() {
      const [list, played] = await Promise.all([this.list(), Matches.countPlayed()]);
      const ready = list.filter((c) => c.ready).length;
      return {
        categories: list.length,
        ready,
        incomplete: list.length - ready,
        questions: list.reduce((n, c) => n + c.questionCount, 0),
        matchesPlayed: played,
      };
    },
  };

  const Questions = {
    get: (id) => db.get('questions', id),
    async getMany(ids) {
      const unique = Array.from(new Set(ids.filter(Boolean)));
      const records = await db.tx('questions', 'readonly', (s) => Promise.all(unique.map((id) => db.req(s.questions.get(id)))));
      const map = new Map();
      records.forEach((r) => { if (r) map.set(r.id, r); });
      return map;
    },
    // اختيار سؤال فاصل: يُفضَّل سؤال 600 من فئة جاهزة لم تُلعب في المباراة
    async pickTiebreaker(match) {
      const used = new Set(match.usedQuestionIds.concat(match.tiebreakerUsedIds || []));
      const playable = await Categories.listPlayable();
      const outside = playable.filter((c) => !match.categoryIds.includes(c.id));
      const pools = [
        outside.flatMap((c) => c.questions.filter((q) => q.points === 600).map((q) => ({ q, c }))),
        outside.flatMap((c) => c.questions.map((q) => ({ q, c }))),
        playable.flatMap((c) => c.questions.map((q) => ({ q, c }))),
      ];
      for (const pool of pools) {
        const candidates = pool.filter((x) => !used.has(x.q.id));
        if (candidates.length) {
          const pick = utils.randomItem(candidates);
          return { question: pick.q, category: pick.c };
        }
      }
      return null;
    },
  };

  SJ.repo = { Settings, Matches, Categories, Questions };
})(window.SJ);
