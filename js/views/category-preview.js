/* معاينة الفئة: لوحة لعب بعيّنة عشوائية من بنك الأسئلة كما ستظهر في مباراة،
   وقائمة بكل أسئلة البنك يمكن فتح أي منها على شاشة السؤال دون احتساب نقاط */
(function (SJ) {
  'use strict';

  const { h, icon } = SJ.dom;
  const { utils } = SJ;
  const { Categories } = SJ.repo;
  const C = SJ.views.common;

  SJ.views.categoryPreview = {
    title: 'معاينة الفئة',
    async render(container, params) {
      const cat = await Categories.get(params.id);
      if (!cat) {
        const content = C.adminShell(container, { active: '/admin', title: 'الفئة غير موجودة', back: '/admin' });
        content.append(C.emptyState({ icon: 'warning', title: 'الفئة غير موجودة', actions: [C.linkButton('العودة', '/admin', 'primary', 'arrowRight')] }));
        return;
      }
      const content = C.adminShell(container, {
        active: '/admin',
        title: `معاينة: ${cat.name}`,
        back: '/admin',
        actions: cat.inUse ? [] : [C.linkButton('تعديل الفئة', `/admin/category/${cat.id}`, 'secondary', 'edit')],
      });

      const missing = cat.missingLevels.map((m) => `ينقص ${m.need} من مستوى ${m.points}`);
      if (!cat.hasImage) missing.push('بدون صورة');
      content.append(C.banner({
        type: cat.ready ? 'info' : 'warning',
        icon: cat.ready ? 'eye' : 'warning',
        text: cat.ready
          ? `معاينة فقط: اللوحة تعرض عيّنة عشوائية من بنك الأسئلة كما في المباراة. افتح أي بطاقة أو أي سؤال من القائمة لتراه على الشاشة الكبيرة. لا تُحتسب أي نقاط.${cat.isActive ? '' : ' (الفئة معطّلة حاليًا ولن تظهر في اللعب حتى تفعّلها.)'}`
          : `الفئة ناقصة (${missing.join('، ')}) ولن تظهر في صفحة اللعب حتى تكتمل.`,
      }));

      const openQuestion = (q, originEl) => SJ.questionScreen.open({
        mode: 'preview',
        question: q,
        category: { name: cat.name, color: cat.color },
        points: q.points,
        originEl,
      });

      // عيّنة للوحة: سؤالان من كل مستوى، والخانة الفارغة تظهر عند نقص المستوى
      const boardHost = h('div', { class: 'preview-board theme-stage' });
      function drawBoard() {
        const slots = [];
        SJ.engine.LEVELS.forEach((points, li) => {
          const pool = cat.questions.filter((q) => q.points === points).map((q) => ({ q, r: Math.random() })).sort((a, b) => a.r - b.r);
          for (let i = 0; i < SJ.engine.PER_LEVEL_ON_BOARD; i++) {
            const order = li * SJ.engine.PER_LEVEL_ON_BOARD + i + 1;
            slots.push({ questionId: pool[i] ? pool[i].q.id : null, order, points });
          }
        });
        const board = SJ.ui.board.build({
          columns: [{ categoryId: cat.id, name: cat.name, color: cat.color, imageId: cat.image, slots }],
          slotState: (slot) => ({ empty: !slot.questionId }),
          onPick: (slot, col, btn) => {
            const q = cat.questions.find((x) => x.id === slot.questionId);
            if (q) openQuestion(q, btn);
          },
        });
        boardHost.replaceChildren(board.el);
      }
      const reshuffle = h('button', { type: 'button', class: 'btn btn--secondary', onclick: drawBoard }, icon('restart'), 'سحب عيّنة أخرى');
      drawBoard();

      // كل أسئلة البنك مجمّعة حسب المستوى
      const list = h('section', { class: 'panel' },
        h('h2', { class: 'panel__title' }, 'كل أسئلة البنك', h('small', null, utils.countLabel(cat.questionCount, { zero: 'لا أسئلة', one: 'سؤال واحد', two: 'سؤالان', few: 'أسئلة', many: 'سؤالًا' }))),
        ...SJ.engine.LEVELS.map((points) => {
          const qs = cat.questions.filter((q) => q.points === points);
          return h('div', { class: 'slot-group' },
            h('div', { class: 'slot-group__head' }, h('span', { class: ['tier-chip', `tier-${points}`] }, utils.formatNumber(points)), h('span', null, `${qs.length}`)),
            qs.length
              ? h('div', { class: 'slots' }, qs.map((q) => {
                const b = h('button', { type: 'button', class: 'slot is-filled' },
                  h('span', { class: 'slot__text slot__text--main' }, q.text),
                  h('span', { class: 'slot__meta' }, h('span', { class: 'badge badge--muted' }, `الإجابة: ${q.answer}`)));
                b.addEventListener('click', () => openQuestion(q, b));
                return b;
              }))
              : h('p', { class: 'field__hint' }, 'لا توجد أسئلة في هذا المستوى.'));
        }));

      content.append(h('div', { class: 'page-head' }, h('h2', { class: 'panel__title' }, 'اللوحة كما ستظهر'), reshuffle), boardHost, list);
      return () => SJ.questionScreen.closeAll();
    },
  };
})(window.SJ);
