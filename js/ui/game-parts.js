/* مكونات اللعب القابلة لإعادة الاستخدام:
   - stage: عرض السؤال على الشاشة الكبيرة (يُستخدم في اللعب والمعاينة ومحرر السؤال)
   - board: لوحة الفئات والبطاقات
   - scoreboard: لوحة النقاط */
(function (SJ) {
  'use strict';

  const { h } = SJ.dom;
  const { utils } = SJ;

  /* ---------- منصة السؤال ---------- */
  function lengthClass(text) {
    const n = utils.countChars(text);
    if (n <= 60) return 's';
    if (n <= 140) return 'm';
    if (n <= 280) return 'l';
    return 'xl';
  }

  function buildStage({ categoryName = '', categoryColor = null, points = 200, text = '', imageId = null, answer = '', answerImageId = null, revealed = false }) {
    const qImg = imageId ? h('img', { alt: 'صورة السؤال' }) : null;
    if (qImg) SJ.images.attach(qImg, imageId);
    const timerSlot = h('div', { class: 'stage__timer-slot' });
    const controls = h('div', { class: 'stage__controls' });
    // الإجابة لا تُضاف للصفحة إلا عند كشفها
    const answerEl = h('div', { class: 'stage__answer', 'aria-live': 'polite' });
    const el = h('div', { class: ['stage', imageId && 'has-image'], style: { '--cat': categoryColor || 'var(--gold)' } },
      h('div', { class: 'stage__top' },
        h('div', { class: 'stage__cat' }, h('span', { class: 'stage__cat-dot' }), h('span', { class: 'stage__cat-name truncate' }, categoryName || 'الفئة')),
        timerSlot,
        h('div', { class: ['stage__points', `tier-${points}`] }, h('span', null, utils.formatNumber(points)), h('small', null, 'نقطة'))),
      h('div', { class: 'stage__main' },
        h('p', { class: 'stage__text', dataset: { len: lengthClass(text) } }, text || 'نص السؤال يظهر هنا'),
        qImg ? h('div', { class: 'stage__media' }, qImg) : null),
      answerEl,
      controls);

    function reveal() {
      if (el.classList.contains('is-revealed')) return;
      let aImg = null;
      if (answerImageId) {
        aImg = h('img', { alt: 'صورة الإجابة' });
        SJ.images.attach(aImg, answerImageId);
      }
      answerEl.replaceChildren(
        h('div', { class: 'stage__answer-body' },
          h('span', { class: 'stage__answer-label' }, 'الإجابة'),
          h('span', { class: 'stage__answer-text' }, answer || '—')),
        aImg ? h('div', { class: 'stage__answer-media' }, aImg) : '');
      el.classList.add('is-revealed');
    }
    if (revealed) reveal();
    return { el, timerSlot, controls, answerEl, reveal, isRevealed: () => el.classList.contains('is-revealed') };
  }

  /* ---------- لوحة اللعب ----------
     columns: [{categoryId, name, color, imageId, slots:[{questionId, order, points}]}]
     slotState(slot, column) → {used, empty, color, label} */
  function buildBoard({ columns, slotState, onPick, interactive = true }) {
    const el = h('div', { class: 'board', style: { '--cols': String(columns.length) } });
    const cards = [];
    columns.forEach((col) => {
      const img = h('img', { class: 'board-col__img', alt: '' });
      SJ.images.attach(img, col.imageId);
      const grid = h('div', { class: 'board-col__cards' });
      col.slots.forEach((slot) => {
        const owner = h('span', { class: 'qcard__owner truncate' });
        const btn = h('button', { type: 'button', class: ['qcard', `tier-${slot.points}`] },
          h('span', { class: 'qcard__points' }, utils.formatNumber(slot.points)), owner);
        btn.addEventListener('click', () => {
          if (btn.disabled || !onPick) return;
          onPick(slot, col, btn);
        });
        grid.append(btn);
        cards.push({ btn, owner, slot, col });
      });
      el.append(h('section', { class: 'board-col', style: { '--cat': col.color || 'var(--gold)' }, 'aria-label': `فئة ${col.name}` },
        h('header', { class: 'board-col__head' }, img, h('h2', { class: 'board-col__name truncate' }, col.name)),
        grid));
    });

    function refresh() {
      cards.forEach(({ btn, owner, slot, col }) => {
        const st = slotState(slot, col) || {};
        btn.disabled = !interactive || !!st.used || !!st.empty;
        btn.classList.toggle('is-used', !!st.used);
        btn.classList.toggle('is-empty', !!st.empty);
        btn.style.setProperty('--owner', st.color || 'var(--used)');
        owner.textContent = st.label || '';
        const state = st.empty ? ' — خانة فارغة' : st.used ? ` — مستخدم${st.label ? `: ${st.label}` : ''}` : '';
        btn.setAttribute('aria-label', `${col.name}، ${slot.points} نقطة${state}`);
      });
    }

    refresh();
    return {
      el,
      refresh,
      cardFor: (questionId) => {
        const c = cards.find((x) => x.slot.questionId === questionId);
        return c ? c.btn : null;
      },
    };
  }

  /* ---------- لوحة النقاط ---------- */
  function buildScoreboard(match) {
    const el = h('div', { class: ['scoreboard', `scoreboard--${match.mode}`] });
    const items = match.players.map((p) => {
      const scoreEl = h('span', { class: 'score-card__score', 'aria-live': 'polite' }, utils.formatNumber(p.score));
      scoreEl.dataset.value = String(p.score);
      const card = h('div', { class: 'score-card', style: { '--c': p.color } },
        h('span', { class: 'score-card__turn' }, 'الدور'),
        h('span', { class: 'score-card__name truncate', title: p.name }, p.name),
        scoreEl);
      return { card, scoreEl };
    });
    items.forEach((it, i) => {
      if (i > 0) el.append(h('span', { class: 'vs', 'aria-hidden': 'true' }, 'ضد'));
      el.append(it.card);
    });

    function floatDelta(card, delta) {
      if (utils.prefersReducedMotion()) return;
      const d = h('span', { class: ['score-delta', delta > 0 ? 'is-pos' : 'is-neg'] }, utils.formatSigned(delta));
      card.append(d);
      setTimeout(() => d.remove(), 1200);
    }

    function update(m) {
      m.players.forEach((p, i) => {
        const it = items[i];
        const prev = Number(it.scoreEl.dataset.value);
        if (prev !== p.score) {
          SJ.ui.animateNumber(it.scoreEl, prev, p.score);
          it.scoreEl.dataset.value = String(p.score);
          floatDelta(it.card, p.score - prev);
          it.card.classList.remove('is-bump');
          void it.card.offsetWidth;
          it.card.classList.add('is-bump');
        }
        it.card.classList.toggle('is-turn', m.mode === 'teams' && m.status === 'playing' && !m.tiebreaker && m.currentTurn === i);
      });
    }

    update(match);
    return { el, update };
  }

  SJ.ui.stage = { build: buildStage, lengthClass };
  SJ.ui.board = { build: buildBoard };
  SJ.ui.scoreboard = { build: buildScoreboard };
})(window.SJ);
