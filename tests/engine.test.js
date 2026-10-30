/* اختبارات محرك اللعبة — التشغيل: node --test */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../js/game/engine.js');

function column(catId, prefix) {
  return {
    categoryId: catId,
    name: `فئة ${catId}`,
    color: '#ffffff',
    imageId: null,
    slots: [1, 2, 3, 4, 5, 6].map((order) => ({ questionId: `${prefix}${order}`, order })),
  };
}

function teamsMatch(settings = {}) {
  return engine.createMatch({
    id: 'm1',
    code: 'ABC123',
    mode: 'teams',
    players: [{ name: 'أ', color: '#3b82f6' }, { name: 'ب', color: '#f97316' }],
    board: [column('c1', 'a')],
    settings,
    now: 1000,
  });
}

function singleMatch(settings = {}) {
  return engine.createMatch({
    id: 'm2',
    code: 'XYZ789',
    mode: 'single',
    players: [{ name: 'سارة', color: '#f5c542' }],
    board: [column('c1', 'a')],
    settings,
    now: 1000,
  });
}

function answer(m, qid, outcome) {
  return engine.resolveQuestion(engine.openQuestion(m, qid, 1), { outcome, now: 2 });
}

test('النقاط تُحدَّد حسب الترتيب', () => {
  const m = teamsMatch();
  assert.deepEqual(m.board[0].slots.map((s) => s.points), [200, 200, 400, 400, 600, 600]);
});

test('التحقق من عدد اللاعبين والفئات', () => {
  assert.throws(() => engine.createMatch({ mode: 'teams', players: [{ name: 'x', color: '#000000' }], board: [column('c', 'q')] }), /فريقان/);
  assert.throws(() => engine.createMatch({ mode: 'single', players: [{ name: 'x', color: '#000000' }], board: [] }), /فئة/);
  const four = ['a', 'b', 'c', 'd'].map((p) => column(p, p));
  assert.throws(() => engine.createMatch({ mode: 'single', players: [{ name: 'x', color: '#000000' }], board: four }));
  const bad = column('c', 'q');
  bad.slots.pop();
  assert.throws(() => engine.createMatch({ mode: 'single', players: [{ name: 'x', color: '#000000' }], board: [bad] }), /غير مكتملة/);
});

test('الدوال لا تعدّل الحالة الأصلية', () => {
  const m = teamsMatch();
  const frozen = JSON.stringify(m);
  answer(m, 'a1', 'turn');
  assert.equal(JSON.stringify(m), frozen);
});

test('فريقان: صاحب الدور يجيب صح ثم يتبدل الدور', () => {
  let m = teamsMatch();
  m = answer(m, 'a5', 'turn');
  assert.equal(m.players[0].score, 600);
  assert.equal(m.players[0].correct, 1);
  assert.equal(m.currentTurn, 1);
  assert.deepEqual(m.usedQuestionIds, ['a5']);
  assert.equal(m.results.a5.playerId, 'p1');
});

test('فريقان: السرقة تمنح النقاط للفريق الآخر', () => {
  let m = teamsMatch();
  m = answer(m, 'a3', 'steal');
  assert.equal(m.players[0].score, 0);
  assert.equal(m.players[0].wrong, 1);
  assert.equal(m.players[1].score, 400);
  assert.equal(m.results.a3.playerId, 'p2');
  assert.equal(m.history.at(-1).stolen, true);
});

test('السرقة مرفوضة عند تعطيلها', () => {
  const m = engine.openQuestion(teamsMatch({ allowSteal: false }), 'a1', 1);
  assert.throws(() => engine.resolveQuestion(m, { outcome: 'steal' }), /السرقة/);
});

test('الخطأ لا يخصم افتراضيًا، ويخصم عند التفعيل', () => {
  let m = answer(teamsMatch(), 'a1', 'nobody');
  assert.equal(m.players[0].score, 0);
  assert.equal(m.results.a1.playerId, null);
  m = answer(teamsMatch({ deductOnWrong: true }), 'a6', 'nobody');
  assert.equal(m.players[0].score, -600);
  let s = answer(singleMatch({ deductOnWrong: true }), 'a2', 'wrong');
  assert.equal(s.players[0].score, -200);
  s = answer(singleMatch(), 'a2', 'wrong');
  assert.equal(s.players[0].score, 0);
  assert.equal(s.players[0].wrong, 1);
});

test('السؤال المستخدم لا يُفتح مرة أخرى في نفس المباراة', () => {
  const m = answer(teamsMatch(), 'a1', 'turn');
  assert.throws(() => engine.openQuestion(m, 'a1'), /تم استخدام/);
  // مباراة جديدة على نفس الأسئلة: السؤال متاح
  assert.doesNotThrow(() => engine.openQuestion(teamsMatch(), 'a1'));
});

test('الإغلاق دون احتساب يعيد السؤال متاحًا', () => {
  let m = engine.openQuestion(teamsMatch(), 'a2', 1);
  m = engine.cancelQuestion(m);
  assert.equal(m.currentQuestionId, null);
  assert.equal(m.usedQuestionIds.length, 0);
  assert.doesNotThrow(() => engine.openQuestion(m, 'a2'));
});

test('مباراة فردية كاملة تنتهي تلقائيًا', () => {
  let m = singleMatch();
  ['a1', 'a2', 'a3', 'a4', 'a5'].forEach((q) => { m = answer(m, q, 'correct'); });
  assert.equal(m.status, 'playing');
  m = answer(m, 'a6', 'wrong');
  assert.equal(m.status, 'finished');
  assert.equal(m.endReason, 'completed');
  assert.equal(m.players[0].score, 200 + 200 + 400 + 400 + 600);
  assert.equal(m.players[0].correct, 5);
  assert.equal(m.players[0].wrong, 1);
  const st = engine.standings(m);
  assert.equal(st.isTie, false);
  assert.equal(st.winner.name, 'سارة');
});

test('مباراة جماعية كاملة بحساب صحيح', () => {
  let m = teamsMatch();
  m = answer(m, 'a1', 'turn'); // أ +200
  m = answer(m, 'a2', 'turn'); // ب +200
  m = answer(m, 'a3', 'steal'); // دور أ، ب يسرق +400
  m = answer(m, 'a4', 'nobody'); // دور ب
  m = answer(m, 'a5', 'turn'); // دور أ +600
  m = answer(m, 'a6', 'turn'); // دور ب +600
  assert.equal(m.status, 'finished');
  assert.equal(m.players[0].score, 800);
  assert.equal(m.players[1].score, 1200);
  assert.equal(engine.standings(m).winner.id, 'p2');
});

test('التعديل اليدوي يُسجَّل والتراجع يعيد الحالة', () => {
  let m = teamsMatch();
  m = answer(m, 'a1', 'turn');
  m = engine.adjustScore(m, { playerId: 'p2', delta: 150, reason: 'تصحيح' });
  assert.equal(m.players[1].score, 150);
  assert.equal(m.history.at(-1).type, 'adjust');
  m = engine.undo(m);
  assert.equal(m.players[1].score, 0);
  assert.equal(m.history.at(-1).type, 'undo');
  m = engine.undo(m);
  assert.equal(m.players[0].score, 0);
  assert.equal(m.usedQuestionIds.length, 0);
  assert.equal(m.currentTurn, 0);
  assert.throws(() => engine.undo(m), /لا توجد عملية/);
});

test('التراجع بعد آخر سؤال يعيد المباراة جارية', () => {
  let m = singleMatch();
  ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].forEach((q) => { m = answer(m, q, 'correct'); });
  assert.equal(m.status, 'finished');
  m = engine.undo(m);
  assert.equal(m.status, 'playing');
  assert.equal(engine.remainingCount(m), 1);
});

test('مكدس التراجع محدود', () => {
  let m = teamsMatch();
  for (let i = 0; i < 15; i++) m = engine.adjustScore(m, { playerId: 'p1', delta: 100 });
  assert.equal(m.undoStack.length, engine.UNDO_LIMIT);
});

test('التعادل والسؤال الفاصل', () => {
  let m = teamsMatch();
  m = answer(m, 'a1', 'turn'); // أ 200
  m = answer(m, 'a2', 'turn'); // ب 200
  m = answer(m, 'a3', 'nobody');
  m = answer(m, 'a4', 'nobody');
  m = answer(m, 'a5', 'nobody');
  m = answer(m, 'a6', 'nobody');
  assert.equal(engine.standings(m).isTie, true);
  assert.equal(engine.standings(m).winner, null);
  m = engine.startTiebreaker(m, { questionId: 'z5', categoryId: 'c9', categoryName: 'أخرى', points: 600 });
  assert.equal(m.status, 'playing');
  // الإلغاء يعيد التعادل ويعيد السؤال متاحًا
  const cancelled = engine.cancelTiebreaker(m);
  assert.equal(cancelled.status, 'finished');
  assert.deepEqual(cancelled.tiebreakerUsedIds, []);
  m = engine.resolveTiebreaker(m, { winnerId: 'p2' });
  assert.equal(m.status, 'finished');
  assert.equal(m.players[1].score, 800);
  assert.equal(engine.standings(m).winner.id, 'p2');
});

test('السؤال الفاصل متاح عند التعادل فقط', () => {
  let m = teamsMatch();
  m = engine.finish(answer(m, 'a1', 'turn'), 'ended');
  assert.throws(() => engine.startTiebreaker(m, { questionId: 'z', categoryId: 'c', categoryName: 'x' }), /التعادل/);
});

test('تغيير الدور يدويًا', () => {
  let m = teamsMatch();
  m = engine.setTurn(m, 1);
  assert.equal(m.currentTurn, 1);
  assert.equal(m.history.at(-1).type, 'turn');
});

/* ---------- بنك الأسئلة ---------- */
function bank(perLevel) {
  const qs = [];
  engine.LEVELS.forEach((points) => {
    for (let i = 0; i < perLevel; i++) qs.push({ id: `q${points}-${i}`, points });
  });
  return qs;
}

test('سحب سؤالين من كل مستوى بالترتيب الصحيح للوحة', () => {
  const slots = engine.pickBoardSlots(bank(5));
  assert.equal(slots.length, 6);
  assert.deepEqual(slots.map((s) => s.order), [1, 2, 3, 4, 5, 6]);
  slots.forEach((s) => assert.ok(s.questionId.startsWith(`q${engine.POINTS_BY_ORDER[s.order]}-`)));
  assert.equal(new Set(slots.map((s) => s.questionId)).size, 6);
});

test('تفضيل الأسئلة التي لم تُلعب مؤخرًا', () => {
  const qs = bank(3);
  const lastSeen = { 'q200-0': 500, 'q400-1': 900, 'q600-0': 100, 'q600-2': 50 };
  const slots = engine.pickBoardSlots(qs, { lastSeen });
  const ids = slots.map((s) => s.questionId);
  assert.ok(!ids.includes('q200-0'));
  assert.ok(!ids.includes('q400-1'));
  assert.ok(ids.includes('q600-1') && ids.includes('q600-2'));
});

test('السحب العشوائي يختلف بين المباريات', () => {
  const qs = bank(10);
  const seen = new Set();
  for (let i = 0; i < 20; i++) seen.add(engine.pickBoardSlots(qs).map((s) => s.questionId).join());
  assert.ok(seen.size > 1);
});

test('رفض البنك الذي ينقصه مستوى', () => {
  const qs = bank(2).filter((q) => q.id !== 'q400-1');
  assert.throws(() => engine.pickBoardSlots(qs), /400/);
  assert.deepEqual(engine.countByLevel(qs), { 200: 2, 400: 1, 600: 2 });
});

test('لوحة من البنك تصلح لإنشاء مباراة', () => {
  const m = engine.createMatch({ id: 'x', code: 'X', mode: 'single', players: [{ name: 'أ', color: '#000000' }], board: [{ categoryId: 'c', name: 'ف', slots: engine.pickBoardSlots(bank(4)) }] });
  assert.deepEqual(m.board[0].slots.map((s) => s.points), [200, 200, 400, 400, 600, 600]);
});
