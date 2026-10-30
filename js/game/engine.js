/* محرك اللعبة: منطق المباراة الخالص دون أي اعتماد على الواجهة أو التخزين.
   كل دالة تستقبل حالة المباراة وتعيد نسخة جديدة دون تعديل الأصل،
   لذلك يمكن اختبارها في Node مباشرة وإعادة استخدامها في نسخة الخادم لاحقًا. */
(function (root, factory) {
  const engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  else {
    root.SJ = root.SJ || {};
    root.SJ.engine = engine;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // النقاط حسب ترتيب البطاقة في عمود الفئة على اللوحة
  const POINTS_BY_ORDER = Object.freeze({ 1: 200, 2: 200, 3: 400, 4: 400, 5: 600, 6: 600 });
  const QUESTIONS_PER_CATEGORY = 6;
  // بنك الأسئلة: مستويات النقاط، وعدد البطاقات من كل مستوى على اللوحة، والحدود لكل مستوى
  const LEVELS = Object.freeze([200, 400, 600]);
  const PER_LEVEL_ON_BOARD = 2;
  const MIN_PER_LEVEL = PER_LEVEL_ON_BOARD;
  const MAX_PER_LEVEL = 50;
  const MAX_CATEGORIES = 3;
  const UNDO_LIMIT = 10;
  const DEFAULT_SETTINGS = Object.freeze({ timerSeconds: 30, deductOnWrong: false, allowSteal: true });

  class EngineError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'EngineError';
      this.code = code;
    }
  }

  const clone = (o) => JSON.parse(JSON.stringify(o));

  // عدد أسئلة البنك في كل مستوى نقاط
  function countByLevel(questions) {
    const counts = {};
    LEVELS.forEach((p) => { counts[p] = 0; });
    questions.forEach((q) => { if (counts[q.points] !== undefined) counts[q.points] += 1; });
    return counts;
  }

  /* اختيار أسئلة اللوحة من بنك الفئة: سؤالان من كل مستوى نقاط.
     الأقل ظهورًا مؤخرًا يُختار أولًا (lastSeen: معرّف السؤال ← آخر وقت ظهر فيه على لوحة)،
     والأسئلة المتساوية تُرتَّب عشوائيًا حتى تختلف اللوحة من مباراة لأخرى */
  function pickBoardSlots(questions, { lastSeen = {}, random = Math.random } = {}) {
    const slots = [];
    LEVELS.forEach((points, levelIndex) => {
      const pool = questions
        .filter((q) => q.points === points)
        .map((q) => ({ q, seen: lastSeen[q.id] || 0, r: random() }))
        .sort((a, b) => a.seen - b.seen || a.r - b.r);
      if (pool.length < PER_LEVEL_ON_BOARD) {
        throw new EngineError('NOT_ENOUGH', `لا توجد أسئلة كافية بقيمة ${points} نقطة.`);
      }
      pool.slice(0, PER_LEVEL_ON_BOARD).forEach((x, i) => {
        slots.push({ questionId: x.q.id, order: levelIndex * PER_LEVEL_ON_BOARD + i + 1 });
      });
    });
    return slots;
  }

  // إنشاء مباراة جديدة. board: [{categoryId, name, color, imageId, slots:[{questionId, order}]}]
  function createMatch({ id, code, mode, players, board, settings, now = Date.now() }) {
    if (mode !== 'single' && mode !== 'teams') throw new EngineError('BAD_MODE', 'وضع اللعب غير صالح.');
    const expected = mode === 'single' ? 1 : 2;
    if (!Array.isArray(players) || players.length !== expected) {
      throw new EngineError('BAD_PLAYERS', mode === 'single' ? 'يلزم متسابق واحد.' : 'يلزم فريقان بالضبط.');
    }
    if (!Array.isArray(board) || board.length < 1 || board.length > MAX_CATEGORIES) {
      throw new EngineError('BAD_BOARD', `اختر من فئة واحدة إلى ${MAX_CATEGORIES} فئات.`);
    }
    const seen = new Set();
    const normalizedBoard = board.map((col) => {
      if (!col.slots || col.slots.length !== QUESTIONS_PER_CATEGORY) {
        throw new EngineError('BAD_BOARD', `الفئة «${col.name}» غير مكتملة.`);
      }
      const slots = col.slots
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((s) => {
          if (seen.has(s.questionId)) throw new EngineError('BAD_BOARD', 'يوجد سؤال مكرر في اللوحة.');
          seen.add(s.questionId);
          return { questionId: s.questionId, order: s.order, points: POINTS_BY_ORDER[s.order] };
        });
      return { categoryId: col.categoryId, name: col.name, color: col.color || null, imageId: col.imageId || null, slots };
    });

    return {
      id,
      code,
      mode,
      categoryIds: normalizedBoard.map((c) => c.categoryId),
      board: normalizedBoard,
      players: players.map((p, i) => ({
        id: p.id || `p${i + 1}`,
        name: p.name,
        color: p.color,
        score: 0,
        correct: 0,
        wrong: 0,
      })),
      usedQuestionIds: [],
      results: {},
      currentQuestionId: null,
      questionOpenedAt: null,
      currentTurn: 0,
      status: 'playing',
      settings: Object.assign({}, DEFAULT_SETTINGS, settings || {}),
      history: [],
      undoStack: [],
      tiebreaker: null,
      tiebreakerUsedIds: [],
      startedAt: now,
      finishedAt: null,
      endReason: null,
      updatedAt: now,
    };
  }

  function findSlot(m, questionId) {
    for (const column of m.board) {
      for (const slot of column.slots) if (slot.questionId === questionId) return { column, slot };
    }
    return null;
  }

  const isUsed = (m, questionId) => m.usedQuestionIds.includes(questionId);
  const totalQuestions = (m) => m.board.reduce((sum, c) => sum + c.slots.length, 0);
  const remainingCount = (m) => totalQuestions(m) - m.usedQuestionIds.length;
  const isBoardComplete = (m) => remainingCount(m) <= 0;
  const turnPlayer = (m) => (m.mode === 'teams' ? m.players[m.currentTurn] : m.players[0]);
  const canUndo = (m) => m.undoStack.length > 0;

  function getPlayer(m, playerId) {
    const p = m.players.find((x) => x.id === playerId);
    if (!p) throw new EngineError('NO_PLAYER', 'المتسابق غير موجود.');
    return p;
  }

  function assertPlaying(m) {
    if (m.status !== 'playing') throw new EngineError('NOT_PLAYING', 'المباراة ليست جارية.');
  }

  // لقطة للحالة القابلة للتراجع (بدون السجل ومكدس التراجع نفسه)
  function snapshot(m) {
    return clone({
      players: m.players,
      usedQuestionIds: m.usedQuestionIds,
      results: m.results,
      currentTurn: m.currentTurn,
      status: m.status,
      finishedAt: m.finishedAt,
      endReason: m.endReason,
      tiebreaker: m.tiebreaker,
      tiebreakerUsedIds: m.tiebreakerUsedIds,
    });
  }

  function pushUndo(m, label) {
    m.undoStack.push({ label, state: snapshot(m) });
    if (m.undoStack.length > UNDO_LIMIT) m.undoStack.shift();
  }

  function finishInPlace(m, reason, now) {
    m.status = 'finished';
    m.finishedAt = now;
    m.endReason = reason;
    m.currentQuestionId = null;
    m.questionOpenedAt = null;
    m.history.push({ type: 'end', reason, at: now });
  }

  function openQuestion(match, questionId, now = Date.now()) {
    const m = clone(match);
    assertPlaying(m);
    if (m.tiebreaker) throw new EngineError('TIEBREAK_ACTIVE', 'يوجد سؤال فاصل جارٍ.');
    if (m.currentQuestionId && m.currentQuestionId !== questionId) {
      throw new EngineError('QUESTION_OPEN', 'يوجد سؤال مفتوح بالفعل.');
    }
    if (!findSlot(m, questionId)) throw new EngineError('NO_QUESTION', 'السؤال غير موجود في هذه المباراة.');
    if (isUsed(m, questionId)) throw new EngineError('USED', 'تم استخدام هذا السؤال في هذه المباراة.');
    m.currentQuestionId = questionId;
    m.questionOpenedAt = now;
    m.updatedAt = now;
    return m;
  }

  // إغلاق السؤال دون احتساب: يعود متاحًا
  function cancelQuestion(match, now = Date.now()) {
    const m = clone(match);
    m.currentQuestionId = null;
    m.questionOpenedAt = null;
    m.updatedAt = now;
    return m;
  }

  /* احتساب نتيجة السؤال المفتوح.
     الوضع الفردي: outcome = 'correct' | 'wrong'
     وضع الفريقين: outcome = 'turn' (صاحب الدور أجاب صح) | 'steal' (أخطأ صاحب الدور وسرق الآخر) | 'nobody' */
  function resolveQuestion(match, { outcome, elapsedMs = null, now = Date.now() } = {}) {
    const m = clone(match);
    assertPlaying(m);
    const questionId = m.currentQuestionId;
    if (!questionId) throw new EngineError('NO_OPEN_QUESTION', 'لا يوجد سؤال مفتوح.');
    const { column, slot } = findSlot(m, questionId);
    const points = slot.points;
    const deduct = !!m.settings.deductOnWrong;

    const entry = {
      type: 'answer',
      questionId,
      categoryId: column.categoryId,
      points,
      outcome,
      turnPlayerId: null,
      winnerId: null,
      scoreChanges: [],
      elapsedMs,
      at: now,
    };
    const change = (p, delta) => {
      p.score += delta;
      entry.scoreChanges.push({ playerId: p.id, delta });
    };

    if (m.mode === 'single') {
      const p = m.players[0];
      entry.turnPlayerId = p.id;
      if (outcome === 'correct') {
        p.correct += 1;
        change(p, points);
        entry.winnerId = p.id;
      } else if (outcome === 'wrong') {
        p.wrong += 1;
        if (deduct) change(p, -points);
      } else {
        throw new EngineError('BAD_OUTCOME', 'نتيجة غير صالحة للوضع الفردي.');
      }
    } else {
      const turn = m.players[m.currentTurn];
      const other = m.players[1 - m.currentTurn];
      entry.turnPlayerId = turn.id;
      if (outcome === 'turn') {
        turn.correct += 1;
        change(turn, points);
        entry.winnerId = turn.id;
      } else if (outcome === 'steal') {
        if (!m.settings.allowSteal) throw new EngineError('STEAL_DISABLED', 'فرصة السرقة غير مفعّلة.');
        turn.wrong += 1;
        if (deduct) change(turn, -points);
        other.correct += 1;
        change(other, points);
        entry.winnerId = other.id;
        entry.stolen = true;
      } else if (outcome === 'nobody') {
        turn.wrong += 1;
        if (deduct) change(turn, -points);
      } else {
        throw new EngineError('BAD_OUTCOME', 'نتيجة غير صالحة لوضع الفريقين.');
      }
    }

    pushUndoBefore(match, m, 'answer');
    m.usedQuestionIds.push(questionId);
    m.results[questionId] = { playerId: entry.winnerId };
    m.currentQuestionId = null;
    m.questionOpenedAt = null;
    if (m.mode === 'teams') m.currentTurn = 1 - m.currentTurn;
    m.history.push(entry);
    if (isBoardComplete(m)) finishInPlace(m, 'completed', now);
    m.updatedAt = now;
    return m;
  }

  // حفظ لقطة الحالة الأصلية (قبل التعديل) في مكدس التراجع
  function pushUndoBefore(original, target, label) {
    target.undoStack.push({ label, state: snapshot(original) });
    if (target.undoStack.length > UNDO_LIMIT) target.undoStack.shift();
  }

  // تعديل يدوي للنقاط يُسجَّل في السجل ويمكن التراجع عنه
  function adjustScore(match, { playerId, delta, reason = '', now = Date.now() }) {
    const m = clone(match);
    if (!Number.isInteger(delta) || delta === 0) throw new EngineError('BAD_DELTA', 'قيمة التعديل غير صالحة.');
    if (Math.abs(delta) > 100000) throw new EngineError('BAD_DELTA', 'قيمة التعديل كبيرة جدًا.');
    pushUndo(m, 'adjust');
    const p = getPlayer(m, playerId);
    p.score += delta;
    m.history.push({ type: 'adjust', playerId, delta, reason: String(reason || '').slice(0, 60), at: now });
    m.updatedAt = now;
    return m;
  }

  function setTurn(match, index, now = Date.now()) {
    const m = clone(match);
    if (m.mode !== 'teams') return m;
    if (index !== 0 && index !== 1) throw new EngineError('BAD_TURN', 'دور غير صالح.');
    if (m.currentTurn === index) return m;
    m.currentTurn = index;
    m.history.push({ type: 'turn', playerId: m.players[index].id, at: now });
    m.updatedAt = now;
    return m;
  }

  function undo(match, now = Date.now()) {
    const m = clone(match);
    const last = m.undoStack.pop();
    if (!last) throw new EngineError('NOTHING_TO_UNDO', 'لا توجد عملية للتراجع عنها.');
    Object.assign(m, clone(last.state));
    m.currentQuestionId = null;
    m.questionOpenedAt = null;
    m.history.push({ type: 'undo', undid: last.label, at: now });
    m.updatedAt = now;
    return m;
  }

  function finish(match, reason = 'ended', now = Date.now()) {
    const m = clone(match);
    if (m.status === 'finished') return m;
    m.tiebreaker = null;
    finishInPlace(m, reason, now);
    m.updatedAt = now;
    return m;
  }

  // الترتيب النهائي وتحديد الفائز أو التعادل
  function standings(match) {
    const ranking = match.players.slice().sort((a, b) => b.score - a.score);
    if (match.mode === 'single') return { ranking, winner: ranking[0], isTie: false };
    const isTie = ranking.length > 1 && ranking[0].score === ranking[1].score;
    return { ranking, winner: isTie ? null : ranking[0], isTie };
  }

  // بدء سؤال فاصل عند التعادل في وضع الفريقين
  function startTiebreaker(match, { questionId, categoryId, categoryName, categoryColor = null, points = 600 }, now = Date.now()) {
    const m = clone(match);
    if (m.mode !== 'teams') throw new EngineError('NOT_TEAMS', 'السؤال الفاصل متاح في وضع الفريقين فقط.');
    if (m.status !== 'finished' || !standings(m).isTie) throw new EngineError('NOT_TIE', 'السؤال الفاصل متاح عند التعادل فقط.');
    if (!questionId) throw new EngineError('NO_QUESTION', 'لا يوجد سؤال فاصل.');
    m.status = 'playing';
    m.finishedAt = null;
    m.endReason = null;
    m.tiebreaker = { questionId, categoryId, categoryName, categoryColor, points };
    m.tiebreakerUsedIds.push(questionId);
    m.history.push({ type: 'tiebreak-start', questionId, at: now });
    m.updatedAt = now;
    return m;
  }

  // winnerId: الفريق الذي أجاب أولًا إجابة صحيحة، أو null إن لم يُجب أحد
  function resolveTiebreaker(match, { winnerId = null, elapsedMs = null, now = Date.now() } = {}) {
    const m = clone(match);
    if (!m.tiebreaker) throw new EngineError('NO_TIEBREAK', 'لا يوجد سؤال فاصل جارٍ.');
    pushUndo(m, 'tiebreak');
    const tb = m.tiebreaker;
    const entry = { type: 'tiebreak', questionId: tb.questionId, categoryId: tb.categoryId, points: tb.points, winnerId, scoreChanges: [], elapsedMs, at: now };
    if (winnerId) {
      const p = getPlayer(m, winnerId);
      p.score += tb.points;
      p.correct += 1;
      entry.scoreChanges.push({ playerId: p.id, delta: tb.points });
    }
    m.history.push(entry);
    m.tiebreaker = null;
    finishInPlace(m, 'completed', now);
    m.updatedAt = now;
    return m;
  }

  // إغلاق السؤال الفاصل دون احتساب: تعود المباراة لحالة التعادل
  function cancelTiebreaker(match, now = Date.now()) {
    const m = clone(match);
    if (!m.tiebreaker) return m;
    const qid = m.tiebreaker.questionId;
    m.tiebreakerUsedIds = m.tiebreakerUsedIds.filter((id) => id !== qid);
    m.tiebreaker = null;
    m.history.push({ type: 'tiebreak-cancel', questionId: qid, at: now });
    m.status = 'finished';
    m.finishedAt = now;
    m.endReason = 'completed';
    m.updatedAt = now;
    return m;
  }

  return {
    POINTS_BY_ORDER,
    QUESTIONS_PER_CATEGORY,
    LEVELS,
    PER_LEVEL_ON_BOARD,
    MIN_PER_LEVEL,
    MAX_PER_LEVEL,
    countByLevel,
    pickBoardSlots,
    MAX_CATEGORIES,
    UNDO_LIMIT,
    DEFAULT_SETTINGS,
    EngineError,
    createMatch,
    openQuestion,
    cancelQuestion,
    resolveQuestion,
    adjustScore,
    setTurn,
    undo,
    canUndo,
    finish,
    standings,
    startTiebreaker,
    resolveTiebreaker,
    cancelTiebreaker,
    findSlot,
    isUsed,
    remainingCount,
    totalQuestions,
    isBoardComplete,
    turnPlayer,
  };
});
