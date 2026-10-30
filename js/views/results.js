/* النتيجة النهائية: إعلان الفائز أو التعادل، الجدول، سجل المباراة، والخيارات التالية */
(function (SJ) {
  'use strict';

  const { h, icon } = SJ.dom;
  const { utils } = SJ;
  const engine = SJ.engine;
  const { Matches, Questions, Categories } = SJ.repo;
  const C = SJ.views.common;

  function historyItem(entry, match, questions) {
    const player = (id) => match.players.find((p) => p.id === id);
    const q = entry.questionId ? questions.get(entry.questionId) : null;
    const qText = q ? `«${Array.from(q.text).slice(0, 60).join('')}${utils.countChars(q.text) > 60 ? '…' : ''}»` : '';
    const total = (entry.scoreChanges || []).reduce((n, c) => n + c.delta, 0);
    let text;
    let color = null;
    let delta = null;
    switch (entry.type) {
      case 'answer': {
        const winner = player(entry.winnerId);
        const turn = player(entry.turnPlayerId);
        color = winner ? winner.color : null;
        if (match.mode === 'single') text = `${entry.winnerId ? 'إجابة صحيحة' : 'إجابة خاطئة'} (${entry.points}) ${qText}`;
        else if (entry.stolen) text = `${winner.name} سرق السؤال بعد خطأ ${turn.name} (${entry.points}) ${qText}`;
        else if (winner) text = `${winner.name} أجاب صح (${entry.points}) ${qText}`;
        else text = `لم يُجب أحد — دور ${turn.name} (${entry.points}) ${qText}`;
        delta = total;
        if (entry.elapsedMs != null) text += ` • ${utils.formatDuration(entry.elapsedMs)}`;
        break;
      }
      case 'adjust': {
        const p = player(entry.playerId);
        color = p ? p.color : null;
        text = `تعديل يدوي لنقاط ${p ? p.name : ''}${entry.reason ? ` — ${entry.reason}` : ''}`;
        delta = entry.delta;
        break;
      }
      case 'undo':
        text = 'تراجع عن آخر عملية';
        break;
      case 'turn': {
        const p = player(entry.playerId);
        color = p ? p.color : null;
        text = `تغيير الدور إلى ${p ? p.name : ''}`;
        break;
      }
      case 'tiebreak-start':
        text = `بدء سؤال فاصل ${qText}`;
        break;
      case 'tiebreak-cancel':
        text = 'إلغاء السؤال الفاصل دون احتساب';
        break;
      case 'tiebreak': {
        const w = player(entry.winnerId);
        color = w ? w.color : null;
        text = w ? `سؤال فاصل: ${w.name} أجاب أولًا` : 'سؤال فاصل: لم يُجب أحد';
        delta = total || null;
        break;
      }
      case 'end':
        text = entry.reason === 'ended' ? 'أنهى المقدم المباراة' : entry.reason === 'abandoned' ? 'أُلغيت المباراة' : 'انتهت كل الأسئلة';
        break;
      default:
        text = entry.type;
    }
    return h('li', { class: 'history__item', style: color ? { '--c': color } : null },
      h('span', { class: 'history__dot' }),
      h('span', null, text),
      delta ? h('span', { class: ['history__delta', delta > 0 ? 'is-pos' : 'is-neg'] }, utils.formatSigned(delta)) : h('span'));
  }

  SJ.views.results = {
    title: 'النتيجة النهائية',
    async render(container, params) {
      container.classList.add('theme-stage');
      const match = await Matches.get(params.id);
      if (!match) {
        container.append(h('div', { class: 'setup' }, C.emptyState({ icon: 'warning', title: 'المباراة غير موجودة', actions: [C.linkButton('الرئيسية', '/', 'primary', 'home')] })));
        return;
      }
      if (match.status === 'playing') {
        SJ.router.go('/game', { replace: true });
        return;
      }

      const { ranking, winner, isTie } = engine.standings(match);
      const root = h('div', { class: 'results' });
      container.append(root);

      // إعلان الفائز
      let hero;
      if (match.mode === 'single') {
        const p = match.players[0];
        const total = p.correct + p.wrong;
        hero = h('div', { class: 'winner' },
          h('div', { class: 'winner__trophy' }, icon('trophy')),
          h('div', { class: 'winner__label' }, 'انتهت المسابقة'),
          h('div', { class: 'winner__name truncate', style: { '--wc': p.color } }, `أحسنت يا ${p.name}!`),
          h('div', { class: 'winner__score' }, `${utils.formatNumber(p.score)} نقطة • ${p.correct} إجابة صحيحة من ${total}`));
      } else if (isTie) {
        hero = h('div', { class: 'winner' },
          h('div', { class: 'winner__trophy' }, icon('swap')),
          h('div', { class: 'winner__label' }, `${utils.formatNumber(ranking[0].score)} – ${utils.formatNumber(ranking[1].score)}`),
          h('div', { class: 'winner__name' }, 'تعادل!'));
      } else {
        hero = h('div', { class: 'winner' },
          h('div', { class: 'winner__trophy' }, icon('trophy')),
          h('div', { class: 'winner__label' }, 'الفائز'),
          h('div', { class: 'winner__name truncate', style: { '--wc': winner.color } }, winner.name),
          h('div', { class: 'winner__score' }, `${utils.formatNumber(winner.score)} نقطة`));
      }
      root.append(hero);
      if (match.endReason !== 'abandoned' && !isTie && (match.mode === 'teams' || match.players[0].score > 0)) {
        setTimeout(() => {
          SJ.ui.confetti({ colors: ['#f8cd57', '#ffffff', (winner || match.players[0]).color, '#22cd88', '#12d3c2'] });
          SJ.sound.play('win');
        }, 250);
      }

      // الجدول النهائي
      root.append(h('table', { class: 'results-table' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, match.mode === 'teams' ? 'الفريق' : 'المتسابق'), h('th', { scope: 'col' }, 'النقاط'), h('th', { scope: 'col' }, 'صحيحة'), h('th', { scope: 'col' }, 'خاطئة'))),
        h('tbody', null, ranking.map((p) => h('tr', { class: !isTie && winner && p.id === winner.id && match.mode === 'teams' ? 'is-winner' : null, style: { '--c': p.color } },
          h('td', { class: 'truncate', title: p.name }, p.name),
          h('td', { class: 'results-table__score' }, utils.formatNumber(p.score)),
          h('td', null, `✅ ${p.correct}`),
          h('td', null, `❌ ${p.wrong}`))))));

      // الأزرار
      const actions = h('div', { class: 'results__actions' });
      let tieNote = null;
      if (isTie) {
        const available = !!(await Questions.pickTiebreaker(match));
        const tbBtn = h('button', { type: 'button', class: 'btn btn--primary btn--lg', disabled: !available }, icon('target'), 'سؤال فاصل');
        if (!available) {
          tieNote = h('p', { class: 'muted' }, 'لا يوجد سؤال متاح للسؤال الفاصل: كل الأسئلة الجاهزة استُخدمت في هذه المباراة. أضف فئة جاهزة أخرى من لوحة الأدمن لتفعيله.');
        }
        tbBtn.addEventListener('click', async () => {
          tbBtn.disabled = true;
          try {
            const pick = await Questions.pickTiebreaker(match);
            if (!pick) {
              SJ.ui.toast('لا يوجد سؤال متاح للسؤال الفاصل. أضف فئات أخرى من لوحة الأدمن.', 'warning');
              tbBtn.disabled = false;
              return;
            }
            const next = engine.startTiebreaker(match, {
              questionId: pick.question.id,
              categoryId: pick.category.id,
              categoryName: pick.category.name,
              categoryColor: pick.category.color,
              points: pick.question.points,
            }, Date.now());
            await Matches.save(next);
            SJ.router.go('/game');
          } catch (err) {
            SJ.ui.toast(SJ.errorMessage(err), 'error');
            tbBtn.disabled = false;
          }
        });
        actions.append(tbBtn);
      }

      const rematchBtn = h('button', { type: 'button', class: ['btn', isTie ? 'btn--secondary' : 'btn--primary', 'btn--lg'] }, icon('restart'), 'مباراة جديدة بنفس اللاعبين');
      rematchBtn.addEventListener('click', async () => {
        rematchBtn.disabled = true;
        try {
          const playable = await Categories.listPlayable();
          const stillOk = match.categoryIds.every((id) => playable.some((c) => c.id === id));
          if (!stillOk) {
            SJ.ui.toast('بعض الفئات لم تعد متاحة. اختر الفئات من جديد.', 'warning');
            SJ.state.setupDraft = { mode: match.mode, players: match.players, step: 3 };
            SJ.router.go('/play');
            return;
          }
          await Matches.create({ mode: match.mode, players: match.players.map((p) => ({ name: p.name, color: p.color })), categoryIds: match.categoryIds });
          SJ.router.go('/game');
        } catch (err) {
          SJ.ui.toast(SJ.errorMessage(err), 'error');
          rematchBtn.disabled = false;
        }
      });
      const otherBtn = h('button', { type: 'button', class: 'btn btn--secondary btn--lg' }, icon('grid'), 'اختيار فئة أخرى');
      otherBtn.addEventListener('click', () => {
        SJ.state.setupDraft = { mode: match.mode, players: match.players, step: 3 };
        SJ.router.go('/play');
      });
      actions.append(rematchBtn, otherBtn, C.linkButton('الصفحة الرئيسية', '/', 'ghost', 'home', 'lg'));
      root.append(actions);
      if (tieNote) root.append(tieNote);

      // سجل المباراة
      const qIds = match.history.map((e) => e.questionId).filter(Boolean);
      const questions = await Questions.getMany(qIds);
      const items = match.history.filter((e) => e.type !== 'end' || match.endReason !== 'completed');
      root.append(h('details', { class: 'history' },
        h('summary', null, `سجل المباراة (${items.length} حدث) — بدأت ${utils.formatDateTime(match.startedAt)}`),
        h('ol', { class: 'history__list' }, items.map((e) => historyItem(e, match, questions)))));
    },
  };
})(window.SJ);
