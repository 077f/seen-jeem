/* لوحة الأدمن الرئيسية: الإحصائيات، البحث والتصفية، بطاقات الفئات */
(function (SJ) {
  'use strict';

  const { h, icon } = SJ.dom;
  const { utils } = SJ;
  const { Categories, Matches } = SJ.repo;
  const C = SJ.views.common;

  const QUESTION_FORMS = { one: 'سؤال واحد', two: 'سؤالان', few: 'أسئلة', many: 'سؤالًا' };

  function statusBadge(cat) {
    if (cat.ready) return h('span', { class: 'badge badge--success' }, 'جاهزة ✅');
    // ما ينقص الفئة: أسئلة في مستوى معيّن (سؤالان على الأقل لكل مستوى) أو الصورة
    const missing = cat.missingLevels.map((m) => `${m.points}: ينقص ${m.need}`);
    if (!cat.hasImage) missing.push('بدون صورة');
    return h('span', { class: 'badge badge--warning', title: 'تحتاج الفئة صورة وسؤالين على الأقل من كل مستوى' }, `ناقصة ${missing.join(' · ')} ⚠️`);
  }

  SJ.views.dashboard = {
    title: 'لوحة التحكم',
    async render(container) {
      const content = C.adminShell(container, {
        active: '/admin',
        title: 'لوحة التحكم',
        actions: [C.linkButton('إضافة فئة', '/admin/category/new', 'primary', 'plus')],
      });
      const bannersEl = h('div', { class: 'form-stack' });
      const statsEl = h('div', { class: 'stats' });
      const gridEl = h('div', { class: 'cat-grid' });
      const filterState = { q: '', status: 'all' };

      const search = h('input', { class: 'input', type: 'search', placeholder: 'ابحث باسم الفئة…', 'aria-label': 'البحث باسم الفئة' });
      const filter = h('select', { class: 'select', 'aria-label': 'تصفية حسب الحالة' },
        h('option', { value: 'all' }, 'كل الفئات'),
        h('option', { value: 'ready' }, 'الجاهزة'),
        h('option', { value: 'incomplete' }, 'الناقصة'),
        h('option', { value: 'active' }, 'المفعّلة'),
        h('option', { value: 'inactive' }, 'المعطّلة'));
      search.addEventListener('input', utils.debounce(() => { filterState.q = search.value; draw(); }, 120));
      filter.addEventListener('change', () => { filterState.status = filter.value; draw(); });

      content.append(bannersEl, statsEl,
        h('div', { class: 'toolbar' }, h('div', { class: 'toolbar__search input-icon' }, icon('search'), search), filter),
        gridEl);

      let categories = [];

      async function load() {
        const [list, stats, info, active] = await Promise.all([Categories.list(), Categories.stats(), SJ.auth.info(), Matches.getActive()]);
        categories = list;
        renderBanners(info, active);
        renderStats(stats);
        draw();
      }

      function renderBanners(info, active) {
        bannersEl.replaceChildren();
        if (info && info.isDefaultPassword) {
          bannersEl.append(C.banner({
            type: 'warning',
            icon: 'shield',
            text: 'ما زلت تستخدم كلمة المرور الافتراضية للأدمن. ننصح بتغييرها.',
            actions: [C.linkButton('تغيير كلمة المرور', '/admin/settings', 'secondary', 'lock', 'sm')],
          }));
        }
        if (active) {
          bannersEl.append(C.banner({
            type: 'info',
            icon: 'lock',
            text: `توجد مباراة جارية (${C.playersLabel(active)})، والفئات المستخدمة فيها مقفلة ولا يمكن تعديلها أو حذفها حتى تنتهي.`,
            actions: [
              C.linkButton('استكمال المباراة', '/game', 'secondary', 'play', 'sm'),
              h('button', {
                type: 'button',
                class: 'btn btn--ghost btn--sm',
                onclick: async () => {
                  const ok = await SJ.ui.confirm({ title: 'إنهاء المباراة الجارية؟', message: 'ستُلغى المباراة الجارية دون نتيجة، وتُفتح الفئات للتعديل.', confirmLabel: 'إنهاء المباراة', danger: true, icon: 'warning' });
                  if (!ok) return;
                  await Matches.abandonActive();
                  SJ.ui.toast('تم إنهاء المباراة الجارية.', 'success');
                  load();
                },
              }, icon('flag'), 'إنهاء المباراة'),
            ],
          }));
        }
      }

      function renderStats(s) {
        const stat = (value, label, mod) => h('div', { class: ['stat', mod && `stat--${mod}`] }, h('span', { class: 'stat__value' }, utils.formatNumber(value)), h('span', { class: 'stat__label' }, label));
        statsEl.replaceChildren(
          stat(s.categories, 'عدد الفئات'),
          stat(s.ready, 'فئات جاهزة', 'success'),
          stat(s.incomplete, 'فئات ناقصة', s.incomplete ? 'warning' : null),
          stat(s.questions, 'إجمالي الأسئلة'),
          stat(s.matchesPlayed, 'مباريات ملعوبة'));
      }

      function matches(cat) {
        const q = utils.nameKey(filterState.q);
        if (q && !utils.nameKey(cat.name).includes(q)) return false;
        switch (filterState.status) {
          case 'ready': return cat.ready;
          case 'incomplete': return !cat.ready;
          case 'active': return cat.isActive;
          case 'inactive': return !cat.isActive;
          default: return true;
        }
      }

      function draw() {
        const visible = categories.filter(matches);
        if (!categories.length) {
          gridEl.replaceChildren(C.emptyState({
            icon: 'grid',
            title: 'لا توجد فئات بعد',
            text: 'ابدأ بإضافة أول فئة: اسم وصورة وستة أسئلة.',
            actions: [C.linkButton('إضافة فئة', '/admin/category/new', 'primary', 'plus')],
          }));
          return;
        }
        if (!visible.length) {
          gridEl.replaceChildren(C.emptyState({ icon: 'search', title: 'لا توجد نتائج', text: 'جرّب كلمة بحث أخرى أو غيّر الفلتر.' }));
          return;
        }
        gridEl.replaceChildren(...visible.map(card));
      }

      function card(cat) {
        const img = h('img', { alt: '', hidden: true, loading: 'lazy' });
        if (cat.image) SJ.images.attach(img, cat.image);
        const toggle = C.switchToggle({
          label: cat.isActive ? 'مفعّلة' : 'معطّلة',
          checked: cat.isActive,
          disabled: cat.inUse,
          onChange: async (value) => {
            try {
              await Categories.setActive(cat.id, value);
              SJ.ui.toast(value ? `تم تفعيل «${cat.name}».` : `تم تعطيل «${cat.name}».`, 'success');
              if (value && !cat.ready) SJ.ui.toast('الفئة مفعّلة لكنها لن تظهر في اللعب حتى تكتمل (6 أسئلة + صورة).', 'warning', { duration: 6000 });
              load();
            } catch (err) {
              toggle.set(!value);
              SJ.ui.toast(SJ.errorMessage(err), 'error');
            }
          },
        });
        const editBtn = cat.inUse
          ? h('button', { type: 'button', class: 'btn btn--secondary btn--sm', disabled: true, title: 'مقفلة أثناء المباراة' }, icon('lock'), 'تعديل')
          : C.linkButton('تعديل', `/admin/category/${cat.id}`, 'secondary', 'edit', 'sm');
        const deleteBtn = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', disabled: cat.inUse, 'aria-label': `حذف ${cat.name}` }, icon('trash'), 'حذف');
        deleteBtn.addEventListener('click', () => remove(cat));
        return h('article', { class: 'cat-card', style: { '--cat': cat.color || 'var(--gold)' } },
          h('div', { class: 'cat-card__media' },
            icon('image'),
            img,
            h('div', { class: 'cat-card__flags' },
              cat.inUse ? h('span', { class: 'badge badge--solid' }, '🔒 قيد الاستخدام') : null,
              cat.isSample ? h('span', { class: 'badge badge--solid' }, 'تجريبية') : null)),
          h('div', { class: 'cat-card__body' },
            h('div', { class: 'cat-card__row' }, h('h2', { class: 'cat-card__title truncate', title: cat.name }, cat.name), statusBadge(cat)),
            h('p', { class: 'cat-card__desc' }, cat.description || 'بدون وصف'),
            h('div', { class: 'cat-card__row' }, toggle.el, h('span', { class: 'field__hint' }, utils.countLabel(cat.questionCount, QUESTION_FORMS))),
            h('div', { class: 'cat-card__actions' },
              editBtn,
              C.linkButton('معاينة', `/admin/category/${cat.id}/preview`, 'secondary', 'eye', 'sm'),
              deleteBtn)));
      }

      async function remove(cat) {
        const count = cat.questionCount;
        const ok = await SJ.ui.confirm({
          title: 'حذف الفئة نهائيًا؟',
          message: `سيتم حذف فئة «${cat.name}» ومعها ${utils.countLabel(count, Object.assign({ zero: 'لا توجد أسئلة' }, QUESTION_FORMS))} وكل الصور المرتبطة بها.`,
          details: 'لا يمكن التراجع عن هذه العملية. صدّر المحتوى من الإعدادات أولًا إن أردت نسخة احتياطية.',
          confirmLabel: 'حذف نهائي',
          danger: true,
          icon: 'trash',
        });
        if (!ok) return;
        try {
          const deleted = await Categories.remove(cat.id);
          SJ.ui.toast(`تم حذف «${cat.name}» و${utils.countLabel(deleted, Object.assign({ zero: 'لا أسئلة' }, QUESTION_FORMS))}.`, 'success');
          load();
        } catch (err) {
          SJ.ui.toast(SJ.errorMessage(err), 'error');
        }
      }

      gridEl.append(C.loading());
      await load();
    },
  };
})(window.SJ);
