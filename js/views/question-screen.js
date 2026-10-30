/* شاشة السؤال: تُفتح بحركة تكبير من البطاقة، مؤقت، كشف الإجابة، واحتساب النتيجة.
   الأوضاع: game (مباراة) | tiebreak (سؤال فاصل) | preview (معاينة الأدمن بلا نقاط) */
(function (SJ) {
  'use strict';

  const { h, icon } = SJ.dom;
  const { utils } = SJ;
  let current = null;

  function open(opts) {
    if (current) current.forceClose();
    const { mode = 'game', question, category, points, match = null, originEl = null, onResolve, onCancel } = opts;
    const settings = match ? match.settings : SJ.repo.Settings.get();
    const isTeams = !!match && match.mode === 'teams';
    const stage = SJ.ui.stage.build({
      categoryName: category.name,
      categoryColor: category.color,
      points,
      text: question.text,
      imageId: question.image,
      answer: question.answer,
      answerImageId: question.answerImage,
    });
    const overlay = h('div', {
      class: ['qs', 'theme-stage', mode === 'tiebreak' && 'qs--tiebreak'],
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': `سؤال من فئة ${category.name} بقيمة ${points} نقطة`,
      tabIndex: -1,
    }, h('div', { class: 'qs__host' }, stage.el));
    const openedAt = Date.now();
    const prevFocus = document.activeElement;
    let revealed = false;
    let finished = false;

    /* ---------- المؤقت ---------- */
    const timer = settings.timerSeconds > 0 ? SJ.ui.createTimer({ seconds: settings.timerSeconds, onEnd: syncPauseBtn }) : null;
    let pauseBtn = null;
    if (timer) {
      pauseBtn = h('button', { type: 'button', class: 'icon-btn icon-btn--lg', onclick: toggleTimer });
      const restartBtn = h('button', { type: 'button', class: 'icon-btn icon-btn--lg', 'aria-label': 'إعادة المؤقت (R)', title: 'إعادة المؤقت (R)', onclick: restartTimer }, icon('restart'));
      stage.timerSlot.append(h('div', { class: 'timer-wrap' }, pauseBtn, timer.el, restartBtn));
      syncPauseBtn();
    }
    function syncPauseBtn() {
      if (!pauseBtn) return;
      const running = timer.isRunning();
      const label = running ? 'إيقاف المؤقت مؤقتًا (P)' : 'استئناف المؤقت (P)';
      pauseBtn.replaceChildren(icon(running ? 'pause' : 'play'));
      pauseBtn.setAttribute('aria-label', label);
      pauseBtn.title = label;
    }
    function toggleTimer() {
      if (!timer) return;
      timer.toggle();
      syncPauseBtn();
    }
    function restartTimer() {
      if (!timer) return;
      timer.restart();
      syncPauseBtn();
    }

    /* ---------- ملاحظات المقدم ---------- */
    let notesBox = null;
    const notesBtn = question.notes ? h('button', { type: 'button', class: 'btn btn--ghost btn--lg', 'aria-expanded': 'false' }, icon('note'), 'ملاحظة للمقدم') : null;
    if (notesBtn) {
      notesBtn.addEventListener('click', () => {
        if (notesBox) {
          notesBox.remove();
          notesBox = null;
        } else {
          notesBox = h('div', { class: 'stage__notes', role: 'note' }, h('strong', null, 'ملاحظة للمقدم: '), question.notes);
          stage.el.append(notesBox);
        }
        notesBtn.setAttribute('aria-expanded', String(!!notesBox));
      });
    }

    /* ---------- أزرار التحكم ---------- */
    const muteBtn = SJ.views.common.muteButton();
    muteBtn.classList.add('icon-btn--lg');
    const revealBtn = h('button', { type: 'button', class: 'btn btn--primary btn--xl', onclick: reveal }, icon('eye'), h('span', null, 'إظهار الإجابة'), h('span', { class: 'kbd' }, 'Space'));
    const cancelBtn = h('button', { type: 'button', class: 'btn btn--ghost btn--lg', onclick: cancel }, icon('arrowRight'), h('span', null, mode === 'preview' ? 'إغلاق' : 'رجوع بدون احتساب'), h('span', { class: 'kbd' }, 'Esc'));
    const scoring = h('div', { class: 'scoring', hidden: true });
    stage.controls.append(
      h('div', { class: 'stage__side' }, muteBtn, notesBtn),
      h('div', { class: 'stage__primary' }, revealBtn, scoring),
      h('div', { class: 'stage__side stage__side--end' }, cancelBtn));

    function scoreBtn({ label, sub, key, cls, color, disabled = false, onClick }) {
      const b = h('button', { type: 'button', class: ['score-btn', cls], style: color ? { '--c': color } : null, disabled },
        h('span', { class: 'score-btn__name truncate' }, label),
        h('span', { class: 'score-btn__sub' }, sub, ' ', key ? h('span', { class: 'kbd' }, key) : null));
      b.addEventListener('click', onClick);
      return b;
    }

    function buildScoring() {
      const btns = [];
      if (mode === 'preview') {
        btns.push(h('button', { type: 'button', class: 'btn btn--secondary btn--lg', onclick: cancel }, icon('check'), 'إغلاق المعاينة'));
      } else if (!isTeams) {
        btns.push(scoreBtn({ label: 'إجابة صحيحة ✅', sub: '', key: '1', cls: 'score-btn--correct', onClick: () => resolve({ outcome: 'correct' }) }));
        btns.push(scoreBtn({ label: 'إجابة خاطئة ❌', sub: settings.deductOnWrong ? `خصم ${points}` : 'بدون خصم', key: '2', cls: 'score-btn--wrong', onClick: () => resolve({ outcome: 'wrong' }) }));
      } else {
        match.players.forEach((p, i) => {
          let sub;
          let disabled = false;
          if (mode === 'tiebreak') sub = 'أجاب أولًا';
          else if (i === match.currentTurn) sub = 'صاحب الدور';
          else if (settings.allowSteal) sub = 'سرقة 🎯';
          else {
            sub = 'السرقة غير مفعّلة';
            disabled = true;
          }
          btns.push(scoreBtn({ label: `✅ ${p.name}`, sub, key: String(i + 1), color: p.color, disabled, onClick: () => teamAward(i) }));
        });
        btns.push(scoreBtn({ label: 'لم يُجب أحد', sub: '', key: '0', cls: 'score-btn--none', onClick: nobody }));
      }
      scoring.replaceChildren(...btns);
    }

    function hintReveal() {
      SJ.ui.toast('اكشف الإجابة أولًا بزر «إظهار الإجابة» أو مفتاح المسافة.', 'info', { duration: 2500 });
    }

    function reveal() {
      if (revealed || finished) return;
      revealed = true;
      stage.reveal();
      SJ.sound.play('reveal');
      if (timer) {
        timer.pause();
        syncPauseBtn();
      }
      revealBtn.hidden = true;
      buildScoring();
      scoring.hidden = false;
      overlay.focus({ preventScroll: true });
    }

    function teamAward(i) {
      if (!revealed) return hintReveal();
      if (mode === 'tiebreak') return resolve({ winnerId: match.players[i].id });
      if (i === match.currentTurn) return resolve({ outcome: 'turn' });
      if (!settings.allowSteal) {
        SJ.ui.toast('فرصة السرقة غير مفعّلة من الإعدادات.', 'warning');
        return undefined;
      }
      return resolve({ outcome: 'steal' });
    }

    function nobody() {
      if (!revealed) return hintReveal();
      if (mode === 'tiebreak') return resolve({ winnerId: null });
      return resolve({ outcome: isTeams ? 'nobody' : 'wrong' });
    }

    function resolve(result) {
      if (finished) return;
      finished = true;
      scoring.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      const positive = ['correct', 'turn', 'steal'].includes(result.outcome) || !!result.winnerId;
      SJ.sound.play(positive ? 'correct' : 'wrong');
      const elapsedMs = Date.now() - openedAt;
      setTimeout(() => close(() => onResolve && onResolve(Object.assign({}, result, { elapsedMs }))), 350);
    }

    function cancel() {
      if (finished) return;
      finished = true;
      close(() => onCancel && onCancel());
    }

    function close(after) {
      if (timer) timer.destroy();
      popKeys();
      if (muteBtn.dispose) muteBtn.dispose();
      current = null;
      const done = () => {
        overlay.remove();
        document.body.classList.remove('has-qs');
        if (prevFocus && prevFocus.isConnected && prevFocus.focus) prevFocus.focus({ preventScroll: true });
        if (after) after();
      };
      if (utils.prefersReducedMotion()) {
        done();
        return;
      }
      overlay.classList.add('is-closing');
      setTimeout(done, 270);
    }

    const scoringKey = (fnTeams, fnSingle) => () => {
      if (mode === 'preview') return;
      if (isTeams) fnTeams();
      else if (!revealed) hintReveal();
      else fnSingle();
    };

    const popKeys = SJ.shortcuts.push({
      exclusive: true,
      handlers: {
        space: reveal,
        esc: cancel,
        '1': scoringKey(() => teamAward(0), () => resolve({ outcome: 'correct' })),
        '2': scoringKey(() => teamAward(1), () => resolve({ outcome: 'wrong' })),
        '0': () => { if (mode !== 'preview') nobody(); },
        p: toggleTimer,
        r: restartTimer,
        f: () => utils.toggleFullscreen(),
        m: () => muteBtn.toggle(),
      },
    });

    /* ---------- الفتح بحركة تكبير من البطاقة ---------- */
    document.body.append(overlay);
    document.body.classList.add('has-qs');
    if (originEl && originEl.isConnected && !utils.prefersReducedMotion()) {
      const r = originEl.getBoundingClientRect();
      overlay.style.transform = `translate(${r.left}px, ${r.top}px) scale(${r.width / window.innerWidth}, ${r.height / window.innerHeight})`;
      overlay.style.opacity = '0.5';
      overlay.style.borderRadius = '60px';
      overlay.getBoundingClientRect();
      overlay.classList.add('is-animating');
      requestAnimationFrame(() => {
        overlay.style.transform = '';
        overlay.style.opacity = '';
        overlay.style.borderRadius = '';
      });
      setTimeout(() => overlay.classList.remove('is-animating'), 460);
    }
    overlay.focus({ preventScroll: true });
    SJ.sound.play('open');
    if (timer) {
      setTimeout(() => {
        if (!finished && !revealed) {
          timer.start();
          syncPauseBtn();
        }
      }, utils.prefersReducedMotion() ? 0 : 450);
    }

    current = {
      forceClose() {
        if (finished) return;
        finished = true;
        close();
      },
    };
    return current;
  }

  // إغلاق أي سؤال مفتوح عند مغادرة الشاشة
  function closeAll() {
    if (current) current.forceClose();
  }

  SJ.questionScreen = { open, closeAll };
})(window.SJ);
