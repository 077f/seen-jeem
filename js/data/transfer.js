/* تصدير كل المحتوى (مع الصور) إلى ملف JSON، واستيراده بعد التحقق الكامل من صحته */
(function (SJ) {
  'use strict';

  const { db, utils, AppError } = SJ;
  const FORMAT = 'seen-jeem-export';
  // الإصدار 2: بنك أسئلة (النقاط بدل الترتيب). ملفات الإصدار 1 تُقرأ وتُحوَّل تلقائيًا
  const VERSION = 2;
  const MAX_FILE_BYTES = 300 * 1024 * 1024;
  const MAX_IMAGE_BYTES = Math.round(SJ.config.IMAGE_MAX_BYTES * 1.5);
  const DATA_URL_HEADER_RE = /^data:image\/(png|jpeg|webp);base64,$/;

  async function exportAll() {
    const [cats, qs, imgs] = await Promise.all([db.getAll('categories'), db.getAll('questions'), db.getAll('images')]);
    const imgMap = new Map(imgs.map((i) => [i.id, i.blob]));
    const toData = async (id) => (id && imgMap.has(id) ? utils.blobToDataURL(imgMap.get(id)) : null);

    const payload = {
      format: FORMAT,
      version: VERSION,
      app: 'سين جيم',
      exportedAt: new Date().toISOString(),
      settings: SJ.repo.Settings.get(),
      categories: await Promise.all(cats.map(async (c) => ({
        id: c.id,
        name: c.name,
        description: c.description || '',
        color: c.color || null,
        isActive: !!c.isActive,
        isSample: !!c.isSample,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        image: await toData(c.image),
      }))),
      questions: await Promise.all(qs.map(async (q) => ({
        id: q.id,
        categoryId: q.categoryId,
        points: q.points,
        text: q.text,
        answer: q.answer,
        notes: q.notes || '',
        image: await toData(q.image),
        answerImage: await toData(q.answerImage),
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
      }))),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    utils.downloadBlob(blob, `seen-jeem-backup-${utils.todayStamp()}.json`);
    return { categories: payload.categories.length, questions: payload.questions.length, bytes: blob.size };
  }

  function checkImage(value, label, errors) {
    if (value == null || value === '') return null;
    const comma = typeof value === 'string' ? value.indexOf(',') : -1;
    if (comma < 0 || !DATA_URL_HEADER_RE.test(value.slice(0, comma + 1)) || /[^A-Za-z0-9+/=]/.test(value.slice(comma + 1))) {
      errors.push(`${label}: صيغة الصورة غير مدعومة (المسموح JPG وPNG وWEBP).`);
      return null;
    }
    const approxBytes = Math.floor((value.length - value.indexOf(',') - 1) * 0.75);
    if (approxBytes > MAX_IMAGE_BYTES) {
      errors.push(`${label}: حجم الصورة أكبر من المسموح.`);
      return null;
    }
    return value;
  }

  /* قراءة الملف والتحقق منه بالكامل قبل أي تعديل على البيانات.
     إن وُجد أي خطأ يُرفض الملف كله مع قائمة الأخطاء */
  async function parseFile(file) {
    if (!file) throw new AppError('IMPORT_INVALID');
    if (!/\.json$/i.test(file.name || '') && file.type && file.type !== 'application/json') {
      throw new AppError('IMPORT_INVALID', 'اختر ملفًا بصيغة JSON صدّرته من سين جيم.');
    }
    if (file.size > MAX_FILE_BYTES) throw new AppError('IMPORT_INVALID', 'الملف كبير جدًا.');
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch (e) {
      throw new AppError('IMPORT_INVALID', 'الملف ليس بصيغة JSON صحيحة.');
    }
    if (!data || data.format !== FORMAT) throw new AppError('IMPORT_INVALID', 'هذا الملف ليس نسخة احتياطية من سين جيم.');
    if (typeof data.version !== 'number' || data.version > VERSION) {
      throw new AppError('IMPORT_INVALID', 'هذا الملف من إصدار أحدث من التطبيق ولا يمكن قراءته.');
    }
    if (!Array.isArray(data.categories) || !Array.isArray(data.questions)) {
      throw new AppError('IMPORT_INVALID', 'بنية الملف غير مكتملة (الفئات أو الأسئلة مفقودة).');
    }

    const errors = [];
    const categories = [];
    const seenNames = [];
    const catIds = new Set();

    data.categories.forEach((c, i) => {
      const label = `الفئة ${i + 1}${c && c.name ? ` «${String(c.name).slice(0, 40)}»` : ''}`;
      if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !c.id) {
        errors.push(`${label}: معرّف مفقود.`);
        return;
      }
      if (catIds.has(c.id)) {
        errors.push(`${label}: معرّف مكرر.`);
        return;
      }
      const errs = SJ.validate.category({ name: c.name, description: c.description || '', color: c.color || null }, seenNames);
      Object.values(errs).forEach((msg) => errors.push(`${label}: ${msg}`));
      const image = checkImage(c.image, label, errors);
      catIds.add(c.id);
      seenNames.push(String(c.name || ''));
      categories.push({
        id: c.id,
        name: utils.normalize(c.name),
        description: utils.normalizeMultiline(c.description || ''),
        color: SJ.validate.isHexColor(c.color) ? c.color : null,
        isActive: c.isActive !== false,
        isSample: !!c.isSample,
        image,
      });
    });

    const questions = [];
    const countsByCat = new Map();
    const { LEVELS, POINTS_BY_ORDER, MAX_PER_LEVEL } = SJ.engine;
    data.questions.forEach((q, i) => {
      const label = `السؤال ${i + 1}`;
      if (!q || typeof q !== 'object') {
        errors.push(`${label}: بيانات غير صالحة.`);
        return;
      }
      if (!catIds.has(q.categoryId)) {
        errors.push(`${label}: مرتبط بفئة غير موجودة في الملف.`);
        return;
      }
      // ملفات الإصدار 1 تحتوي على الترتيب فقط، فنستنتج النقاط منه
      const points = LEVELS.includes(Number(q.points)) ? Number(q.points) : POINTS_BY_ORDER[Number(q.order)];
      const errs = SJ.validate.question({ text: q.text, answer: q.answer, notes: q.notes || '', points });
      Object.values(errs).forEach((msg) => errors.push(`${label}: ${msg}`));
      if (!countsByCat.has(q.categoryId)) countsByCat.set(q.categoryId, {});
      const counts = countsByCat.get(q.categoryId);
      counts[points] = (counts[points] || 0) + 1;
      if (counts[points] === MAX_PER_LEVEL + 1) errors.push(`${label}: الفئة تحتوي على أكثر من ${MAX_PER_LEVEL} سؤالًا بقيمة ${points}.`);
      questions.push({
        categoryId: q.categoryId,
        points,
        text: utils.normalizeMultiline(q.text),
        answer: utils.normalizeMultiline(q.answer),
        notes: utils.normalizeMultiline(q.notes || ''),
        image: checkImage(q.image, label, errors),
        answerImage: checkImage(q.answerImage, `${label} (صورة الإجابة)`, errors),
      });
    });

    if (errors.length) throw new AppError('IMPORT_INVALID', `الملف يحتوي على ${errors.length} خطأ ولم يُستورد.`, { errors });

    const imageCount = categories.filter((c) => c.image).length + questions.reduce((n, q) => n + (q.image ? 1 : 0) + (q.answerImage ? 1 : 0), 0);
    return {
      categories,
      questions,
      settings: data.settings ? SJ.repo.Settings.sanitize(data.settings) : null,
      exportedAt: data.exportedAt || null,
      summary: { categories: categories.length, questions: questions.length, images: imageCount },
    };
  }

  /* تطبيق الاستيراد:
     merge: الفئة ذات الاسم نفسه تُستبدل بمحتوى الملف، والجديدة تُضاف، والباقي يبقى كما هو
     replace: حذف كل المحتوى الحالي ثم إدخال محتوى الملف */
  async function applyImport(parsed, mode) {
    if (mode !== 'merge' && mode !== 'replace') throw new AppError('IMPORT_INVALID', 'طريقة استيراد غير معروفة.');
    if (await SJ.repo.Matches.getActive()) throw new AppError('IMPORT_BLOCKED');

    const now = Date.now();
    const existingCats = await db.getAll('categories');
    const existingQs = await db.getAll('questions');
    const plan = [];
    const imageWrites = [];
    const toBlobId = (dataUrl) => {
      if (!dataUrl) return null;
      const id = utils.uid('img');
      imageWrites.push({ id, blob: utils.dataURLToBlob(dataUrl), createdAt: now });
      return id;
    };

    let added = 0;
    let updated = 0;
    parsed.categories.forEach((c) => {
      const match = mode === 'merge' ? existingCats.find((e) => utils.nameKey(e.name) === utils.nameKey(c.name)) : null;
      if (match) updated++;
      else added++;
      const id = match ? match.id : utils.uid('cat');
      plan.push({
        replaces: match || null,
        record: {
          id,
          name: c.name,
          description: c.description,
          color: c.color,
          image: toBlobId(c.image),
          isActive: c.isActive,
          isSample: c.isSample,
          createdAt: match ? match.createdAt : now,
          updatedAt: now,
        },
        questions: parsed.questions.filter((q) => q.categoryId === c.id).map((q) => ({
          id: utils.uid('q'),
          categoryId: id,
          points: q.points,
          text: q.text,
          answer: q.answer,
          notes: q.notes,
          image: toBlobId(q.image),
          answerImage: toBlobId(q.answerImage),
          createdAt: now,
          updatedAt: now,
        })),
      });
    });

    await db.tx(['categories', 'questions', 'images'], 'readwrite', (s) => {
      if (mode === 'replace') {
        s.categories.clear();
        s.questions.clear();
        s.images.clear();
      } else {
        plan.filter((p) => p.replaces).forEach((p) => {
          const old = p.replaces;
          const oldQs = existingQs.filter((q) => q.categoryId === old.id);
          [old.image].concat(...oldQs.map((q) => [q.image, q.answerImage])).filter(Boolean).forEach((imgId) => s.images.delete(imgId));
          oldQs.forEach((q) => s.questions.delete(q.id));
        });
      }
      imageWrites.forEach((img) => s.images.put(img));
      plan.forEach((p) => {
        s.categories.put(p.record);
        p.questions.forEach((q) => s.questions.put(q));
      });
    });

    SJ.images.clearCache();
    if (mode === 'replace' && parsed.settings) await SJ.repo.Settings.update(parsed.settings);
    return { added, updated, questions: parsed.questions.length };
  }

  SJ.transfer = { exportAll, parseFile, applyImport, FORMAT, VERSION };
})(window.SJ);
