/* لوحة اللعب: لوحة النقاط، أعمدة الفئات، وأزرار المقدم (تعديل النقاط، تراجع، ملء الشاشة، إنهاء).
   كل تغيير في المباراة يُحفظ فورًا، لذا تحديث الصفحة لا يضيّع التقدم */
(function (SJ) {
  'use strict';

  const { h, icon } = SJ.dom;
  const { utils } = SJ;
  const engine = SJ.engine;
  const { Matches, Questions } = SJ.repo;
  const C = SJ.views.common;

  const UNDO_LABELS = { answer: 'آخر احتساب نقاط', adjust: 'آخر تعديل يدوي', tiebreak: 'نتيجة السؤال الفاصل' };

  SJ.views.game = {
    title: 'المباراة',
    async render(container) {
      container.classList.add('theme-stage');
      let match = await Matches.getActive();
      if (!match) {
        container.append(h('div', { class: 'setup' }, C.emptyState({
          icon: 'flag',
          title: 'لا توجد مباراة جارية',
          text: 'ابدأ مباراة جديدة لتظهر لوحة اللعب هنا.',
          actions: [C.linkButton('مباراة جديدة', '/play', 'primary', 'play'), C.linkButton('الرئيسية', '/', 'ghost', 'home')],
        })));
        return;
      }

      const ids = match.board.flatMap((c) => c.slots.map((s) => s.questionId));
      if (match.tiebreaker) ids.push(match.tiebreaker.questionId);
      const questions = await Questions.getMany(ids);
      let qs = null;
      let saving = Promise.resolve();
      let finishTimer = null;

      /* ---------- البناء ---------- */
      const scoreboard = SJ.ui.scoreboard.build(match);
      const status = h('div', { class: 'game__status', 'aria-live': 'polite' });
      const board = SJ.ui.board.build({ columns: match.board, slotState, onPick });
      const undoBtn = h('button', { type: 'button', class: 'btn btn--secondary', onclick: doUndo }, icon('undo'), h('span', null, 'تراجع'), h('span', { class: 'kbd' }, 'Ctrl+Z'));
      const muteBtn = C.muteButton();
      const controls = h('div', { class: 'game__controls', role: 'toolbar', 'aria-label': 'أدوات المقدم' },
        h('button', { type: 'button', class: 'btn btn--secondary', onclick: openAdjust }, icon('sliders'), 'تعديل النقاط'),
        undoBtn,
        h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => utils.toggleFullscreen() }, icon('maximize'), h('span', null, 'ملء الشاشة'), h('span', { class: 'kbd' }, 'F')),
        muteBtn,
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'اختصارات لوحة المفاتيح (?)', title: 'الاختصارات (?)', onclick: C.showShortcuts }, icon('keyboard')),
        h('button', { type: 'button', class: 'btn btn--danger', onclick: endMatch }, icon('flag'), 'إنهاء المباراة'));
      container.append(h('div', { class: 'game' }, scoreboard.el, status, board.el, controls));

      const popKeys = SJ.shortcuts.push({
        handlers: {
          undo: () => { if (!qs) doUndo(); },
          f: () => utils.toggleFullscreen(),
          m: () => muteBtn.toggle(),
        },
      });

      /* ---------- الحالة ---------- */
      function slotState(slot) {
        if (!slot.questionId || !questions.has(slot.questionId)) return { empty: true };
        if (!match.usedQuestionIds.includes(slot.questionId)) return {};
        const res = match.results[slot.questionId];
        const p = res && res.playerId ? match.players.find((x) => x.id === res.playerId) : null;
        return { used: true, color: p ? p.color : null, label: p ? (match.mode === 'teams' ? p.name : '✓') : '✗' };
      }

      function refresh() {
        scoreboard.update(match);
        board.refresh();
        undoBtn.disabled = !engine.canUndo(match);
        const remaining = engine.remainingCount(match);
        const parts = [];
        if (match.tiebreaker) parts.push(h('strong', null, 'سؤال فاصل لكسر التعادل'));
        else if (match.mode === 'teams' && match.status === 'playing') parts.push('الدور على: ', h('strong', { style: { color: match.players[match.currentTurn].color } }, match.players[match.currentTurn].name), ' • ');
        if (!match.tiebreaker) parts.push(`المتبقي ${remaining} من ${engine.totalQuestions(match)} سؤالًا`);
        status.replaceChildren(...parts);
      }

      // تحديث الحالة وحفظها بالترتيب
      function commit(next) {
        match = next;
        refresh();
        saving = saving.then(() => Matches.save(match)).catch((err) => {
          SJ.ui.toast(SJ.errorMessage(err), 'error', { duration: 6000 });
        });
        return saving;
      }

      function scheduleResults() {
        clearTimeout(finishTimer);
        finishTimer = setTimeout(async () => {
          await saving;
          SJ.router.go(`/results/${match.id}`);
        }, 1300);
      }

      /* ---------- فتح الأسئلة ---------- */
      function onPick(slot, col, btn) {
        if (qs || match.status !== 'playing' || match.tiebreaker) return;
        const q = questions.get(slot.questionId);
        if (!q) return;
        let next;
        try {
          next = engine.openQuestion(match, slot.questionId, Date.now());
        } catch (err) {
          SJ.ui.toast(SJ.errorMessage(err), 'error');
          return;
        }
        commit(next);
        openQuestion(q, col, slot.points, btn);
      }

      function openQuestion(q, col, points, originEl) {
        qs = SJ.questionScreen.open({
          mode: 'game',
          question: q,
          category: { name: col.name, color: col.color },
          points,
          match,
          originEl,
          onResolve: (res) => {
            qs = null;
            try {
              commit(engine.resolveQuestion(match, { outcome: res.outcome, elapsedMs: res.elapsedMs, now: Date.now() }));
            } catch (err) {
              SJ.ui.toast(SJ.errorMessage(err), 'error');
              return;
            }
            if (match.status === 'finished') scheduleResults();
          },
          onCancel: () => {
            qs = null;
            commit(engine.cancelQuestion(match, Date.now()));
          },
        });
      }

      async function openTiebreaker() {
        const tb = match.tiebreaker;
        let q = questions.get(tb.questionId);
        if (!q) {
          q = await Questions.get(tb.questionId);
          if (q) questions.set(q.id, q);
        }
        if (!q) {
          SJ.ui.toast('تعذّر العثور على السؤال الفاصل.', 'error');
          await commit(engine.cancelTiebreaker(match, Date.now()));
          SJ.router.go(`/results/${match.id}`);
          return;
        }
        qs = SJ.questionScreen.open({
          mode: 'tiebreak',
          question: q,
          category: { name: tb.categoryName, color: tb.categoryColor },
          points: tb.points,
          match,
          onResolve: (res) => {
            qs = null;
            commit(engine.resolveTiebreaker(match, { winnerId: res.winnerId || null, elapsedMs: res.elapsedMs, now: Date.now() }));
            scheduleResults();
          },
          onCancel: async () => {
            qs = null;
            await commit(engine.cancelTiebreaker(match, Date.now()));
            SJ.router.go(`/results/${match.id}`);
          },
        });
      }

      /* ---------- أدوات المقدم ---------- */
      function doUndo() {
        if (!engine.canUndo(match)) {
          SJ.ui.toast('لا توجد عملية للتراجع عنها.', 'info');
          return;
        }
        const label = match.undoStack[match.undoStack.length - 1].label;
        clearTimeout(finishTimer);
        commit(engine.undo(match, Date.now()));
        SJ.ui.toast(`تم التراجع عن ${UNDO_LABELS[label] || 'آخر عملية'}.`, 'success');
        if (match.tiebreaker) openTiebreaker();
      }

      function openAdjust() {
        if (qs) return;
        let selected = match.mode === 'teams' ? match.currentTurn : 0;
        let delta = 0;
        let turn = match.currentTurn;
        const playerBtns = h('div', { class: 'segmented', role: 'group', 'aria-label': 'المتسابق' });
        const renderPlayers = () => {
          playerBtns.replaceChildren(...match.players.map((p, i) => {
            const b = h('button', { type: 'button', 'aria-pressed': String(i === selected), style: i === selected ? { background: p.color, color: '#fff' } : null }, p.name);
            b.addEventListener('click', () => { selected = i; renderPlayers(); renderPreview(); });
            return b;
          }));
        };
        const custom = h('input', { class: 'input', type: 'number', step: '50', inputmode: 'numeric', placeholder: 'قيمة مخصصة مثل 150 أو ‎-100', dir: 'ltr' });
        const presets = h('div', { class: 'swatches' }, [-600, -400, -200, -100, 100, 200, 400, 600].map((v) => {
          const b = h('button', { type: 'button', class: ['btn', 'btn--sm', v > 0 ? 'btn--secondary' : 'btn--ghost'], dir: 'ltr' }, utils.formatSigned(v));
          b.addEventListener('click', () => { delta += v; custom.value = String(delta); renderPreview(); });
          return b;
        }));
        custom.addEventListener('input', () => { delta = parseInt(custom.value, 10) || 0; renderPreview(); });
        const reason = h('input', { class: 'input', maxLength: 60, placeholder: 'مثال: تصحيح خطأ في الاحتساب' });
        const preview = h('p', { class: 'confirm__msg', 'aria-live': 'polite' });
        const renderPreview = () => {
          const p = match.players[selected];
          preview.replaceChildren('النتيجة: ', h('strong', null, utils.formatNumber(p.score)), ' ← ', h('strong', { style: { color: 'var(--gold)' } }, utils.formatNumber(p.score + delta)), delta ? ` (${utils.formatSigned(delta)})` : '');
        };
        let turnControl = null;
        if (match.mode === 'teams') {
          turnControl = C.segmented({
            label: 'صاحب الدور',
            value: turn,
            options: match.players.map((p, i) => ({ value: i, label: p.name })),
            onChange: (v) => { turn = v; },
          });
        }
        renderPlayers();
        renderPreview();
        SJ.ui.modal({
          title: 'تعديل النقاط يدويًا',
          size: 'md',
          body: h('div', { class: 'form-stack' },
            h('div', { class: 'field' }, h('span', { class: 'field__label' }, match.mode === 'teams' ? 'الفريق' : 'المتسابق'), playerBtns),
            h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'إضافة أو خصم'), presets),
            C.field({ label: 'القيمة', input: custom, hint: 'الأزرار تُجمع على القيمة. استخدم رقمًا سالبًا للخصم.' }).el,
            C.field({ label: 'السبب (اختياري، يُسجَّل في السجل)', input: reason }).el,
            preview,
            turnControl ? h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'صاحب الدور الآن'), turnControl.el) : null),
          actions: [
            {
              label: 'تطبيق',
              variant: 'primary',
              icon: 'check',
              onClick: () => {
                let next = match;
                if (delta) next = engine.adjustScore(next, { playerId: match.players[selected].id, delta, reason: reason.value, now: Date.now() });
                if (match.mode === 'teams' && turn !== match.currentTurn) next = engine.setTurn(next, turn, Date.now());
                if (next === match) return true;
                commit(next);
                SJ.ui.toast(delta ? `تم تعديل نقاط ${match.players[selected].name} (${utils.formatSigned(delta)}) وتسجيله.` : 'تم تغيير صاحب الدور.', 'success');
                return true;
              },
            },
            { label: 'إلغاء', variant: 'ghost' },
          ],
        });
      }

      async function endMatch() {
        if (qs) return;
        const ok = await SJ.ui.confirm({
          title: 'إنهاء المباراة؟',
          message: `تبقّى ${engine.remainingCount(match)} سؤالًا. ستُعرض النتيجة النهائية بالنقاط الحالية.`,
          confirmLabel: 'إنهاء وعرض النتيجة',
          danger: true,
          icon: 'flag',
        });
        if (!ok) return;
        await commit(engine.finish(match, 'ended', Date.now()));
        SJ.router.go(`/results/${match.id}`);
      }

      refresh();

      // استعادة سؤال كان مفتوحًا قبل تحديث الصفحة
      if (match.tiebreaker) openTiebreaker();
      else if (match.currentQuestionId) {
        const found = engine.findSlot(match, match.currentQuestionId);
        const q = questions.get(match.currentQuestionId);
        if (found && q) openQuestion(q, found.column, found.slot.points, null);
        else commit(engine.cancelQuestion(match));
      }

      return () => {
        popKeys();
        clearTimeout(finishTimer);
        if (muteBtn.dispose) muteBtn.dispose();
        SJ.questionScreen.closeAll();
      };
    },
  };
})(window.SJ);
