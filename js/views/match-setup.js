/* إعداد المباراة على ثلاث خطوات: الوضع، المتسابقون، الفئات */
(function (SJ) {
  'use strict';

  const { h, icon } = SJ.dom;
  const { utils, config } = SJ;
  const { Categories, Matches } = SJ.repo;
  const C = SJ.views.common;
  const STEPS = ['وضع اللعب', 'المتسابقون', 'الفئات'];

  SJ.views.setup = {
    title: 'مباراة جديدة',
    async render(container) {
      const active = await Matches.getActive();
      if (active) {
        const choice = await C.promptResume(active);
        if (choice === 'resume') {
          SJ.router.go('/game', { replace: true });
          return;
        }
      }

      // مسودة قادمة من «اختيار فئة أخرى» في شاشة النتيجة
      const incoming = SJ.state.setupDraft;
      SJ.state.setupDraft = null;
      const state = {
        step: 1,
        mode: null,
        singleName: '',
        teams: [{ name: '', color: config.DEFAULT_TEAM_COLORS[0] }, { name: '', color: config.DEFAULT_TEAM_COLORS[1] }],
        categoryIds: [],
      };
      if (incoming && incoming.mode) {
        state.mode = incoming.mode;
        if (incoming.mode === 'single') state.singleName = incoming.players[0].name;
        else state.teams = incoming.players.map((p) => ({ name: p.name, color: p.color }));
        state.step = incoming.step || 1;
      }

      const categories = await Categories.listPlayable();
      const root = h('div', { class: 'setup' });
      container.append(root);
      root.append(h('div', { class: 'setup__head' }, h('h1', { class: 'page-title' }, 'مباراة جديدة'), C.linkButton('الرئيسية', '/', 'ghost', 'home')));

      if (!categories.length) {
        root.append(C.emptyState({
          icon: 'grid',
          title: 'لا توجد فئات جاهزة للعب بعد',
          text: 'تظهر الفئة هنا عندما تكون مفعّلة وتحتوي على صورة وستة أسئلة. أضف فئة جديدة أو أكمل فئة ناقصة من لوحة الأدمن.',
          actions: [C.linkButton('الذهاب للوحة الأدمن', '/admin', 'primary', 'settings'), C.linkButton('الرئيسية', '/', 'ghost', 'home')],
        }));
        return;
      }

      const stepper = h('ol', { class: 'stepper', 'aria-label': 'خطوات الإعداد' });
      const body = h('div', { class: 'setup__body' });
      const backBtn = h('button', { type: 'button', class: 'btn btn--ghost btn--lg' }, icon('arrowRight'), 'رجوع');
      const nextBtn = h('button', { type: 'button', class: 'btn btn--primary btn--lg' });
      root.append(stepper, body, h('div', { class: 'setup__nav' }, backBtn, nextBtn));
      backBtn.addEventListener('click', () => {
        if (state.step === 1) SJ.router.go('/');
        else go(state.step - 1);
      });
      nextBtn.addEventListener('click', () => {
        if (state.step < 3) {
          if (validateStep(state.step)) go(state.step + 1);
        } else start();
      });

      let fieldRefs = [];

      function go(step) {
        state.step = step;
        renderStep();
        SJ.sound.play('click');
      }

      function renderStepper() {
        stepper.replaceChildren(...STEPS.map((label, i) => h('li', {
          class: ['stepper__item', i + 1 === state.step && 'is-active', i + 1 < state.step && 'is-done'],
          'aria-current': i + 1 === state.step ? 'step' : null,
        }, label)));
      }

      function renderStep() {
        renderStepper();
        fieldRefs = [];
        body.replaceChildren();
        if (state.step === 1) renderMode();
        else if (state.step === 2) renderPlayers();
        else renderCategories();
        backBtn.replaceChildren(icon('arrowRight'), h('span', null, state.step === 1 ? 'الرئيسية' : 'رجوع'));
        nextBtn.replaceChildren(...(state.step === 3
          ? [icon('play'), h('span', null, 'ابدأ المباراة')]
          : [h('span', null, 'التالي'), icon('arrowLeft')]));
        updateNext();
        body.querySelector('input, button') && setTimeout(() => {
          const first = body.querySelector('input:not([type=color])') || body.querySelector('button[aria-pressed="true"]') || body.querySelector('button');
          if (first) first.focus({ preventScroll: true });
        }, 30);
      }

      // لا يُسمح بالانتقال قبل تعبئة الحقول المطلوبة
      function updateNext() {
        let ok = true;
        if (state.step === 1) ok = !!state.mode;
        if (state.step === 3) ok = state.categoryIds.length > 0;
        nextBtn.disabled = !ok;
      }

      function renderMode() {
        const card = (mode, iconName, title, desc) => {
          const b = h('button', { type: 'button', class: 'mode-card', 'aria-pressed': String(state.mode === mode) },
            h('span', { class: 'mode-card__icon' }, icon(iconName)),
            h('span', { class: 'mode-card__title' }, title),
            h('span', { class: 'mode-card__desc' }, desc));
          b.addEventListener('click', () => {
            state.mode = mode;
            body.querySelectorAll('.mode-card').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
            updateNext();
            SJ.sound.play('click');
          });
          b.addEventListener('dblclick', () => go(2));
          return b;
        };
        body.append(
          h('h2', { class: 'setup__question' }, 'كيف ستلعبون؟'),
          h('div', { class: 'mode-cards' },
            card('single', 'user', 'فردي', 'متسابق واحد يجيب عن الأسئلة ويجمع النقاط.'),
            card('teams', 'users', 'فريقان', 'فريقان يتناوبان على الأسئلة مع فرصة السرقة.')));
      }

      function nameInput(value, placeholder, onInput) {
        const input = h('input', { class: 'input', maxLength: config.PLAYER_NAME_MAX, value, placeholder, autocomplete: 'off' });
        input.addEventListener('input', () => onInput(input.value));
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            nextBtn.click();
          }
        });
        return input;
      }

      function renderPlayers() {
        if (state.mode === 'single') {
          const input = nameInput(state.singleName, 'مثال: أحمد', (v) => { state.singleName = v; f.setError(''); });
          const f = C.field({ label: 'اسم المتسابق', input, required: true, counterMax: config.PLAYER_NAME_MAX });
          fieldRefs = [{ name: f }];
          body.append(h('h2', { class: 'setup__question' }, 'من سيلعب؟'), h('div', { class: 'team-fields' }, h('div', { class: 'team-field', style: { '--tc': config.SINGLE_PLAYER_COLOR } }, f.el)));
          return;
        }
        const panels = state.teams.map((team, i) => {
          const preview = h('div', { class: 'team-field__preview truncate' });
          const panel = h('div', { class: 'team-field', style: { '--tc': team.color } });
          const refreshPreview = () => {
            preview.textContent = utils.normalize(team.name) || (i === 0 ? 'الفريق الأول' : 'الفريق الثاني');
            panel.style.setProperty('--tc', team.color);
          };
          const input = nameInput(team.name, i === 0 ? 'مثال: الصقور' : 'مثال: النجوم', (v) => {
            team.name = v;
            nameField.setError('');
            refreshPreview();
          });
          const nameField = C.field({ label: 'اسم الفريق', input, required: true, counterMax: config.PLAYER_NAME_MAX });
          const colorError = h('div', { class: 'field__error', role: 'alert' });
          const colors = C.swatches({
            colors: config.TEAM_COLORS,
            value: team.color,
            label: `لون الفريق ${i + 1}`,
            onChange: (c) => {
              team.color = c;
              colorError.textContent = '';
              refreshPreview();
            },
          });
          fieldRefs.push({ name: nameField, colorError });
          refreshPreview();
          panel.append(
            h('div', { class: 'team-field__title' }, h('span', { class: 'team-field__dot' }), i === 0 ? 'الفريق الأول' : 'الفريق الثاني'),
            nameField.el,
            h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'لون الفريق'), colors.el, colorError),
            preview);
          return panel;
        });
        body.append(h('h2', { class: 'setup__question' }, 'من الفريقان؟'), h('div', { class: 'team-fields' }, panels));
      }

      function validateStep(step) {
        if (step === 1) return !!state.mode;
        if (step === 2) {
          const players = state.mode === 'single'
            ? [{ name: state.singleName, color: config.SINGLE_PLAYER_COLOR }]
            : state.teams;
          const errors = SJ.validate.players(players, state.mode);
          errors.forEach((e, i) => {
            if (!fieldRefs[i]) return;
            fieldRefs[i].name.setError(e.name);
            if (fieldRefs[i].colorError) fieldRefs[i].colorError.textContent = e.color || '';
          });
          if (SJ.validate.hasErrors(errors)) {
            SJ.ui.toast(SJ.validate.firstError(errors), 'error');
            const firstBad = errors.findIndex((e) => e.name);
            if (firstBad >= 0) fieldRefs[firstBad].name.input.focus();
            return false;
          }
          return true;
        }
        return state.categoryIds.length > 0;
      }

      function renderCategories() {
        const max = config.MAX_CATEGORIES_PER_MATCH;
        state.categoryIds = state.categoryIds.filter((id) => categories.some((c) => c.id === id));
        const counter = h('span', { class: 'badge badge--gold' });
        const updateCounter = () => { counter.textContent = `اخترت ${state.categoryIds.length} من ${max}`; };
        const grid = h('div', { class: 'pick-grid' }, categories.map((cat) => {
          const img = h('img', { class: 'pick-card__img', alt: '' });
          SJ.images.attach(img, cat.image);
          const b = h('button', { type: 'button', class: 'pick-card', style: { '--cat': cat.color || 'var(--gold)' }, 'aria-pressed': String(state.categoryIds.includes(cat.id)) },
            img,
            h('span', { class: 'pick-card__check', 'aria-hidden': 'true' }, icon('check')),
            h('span', { class: 'pick-card__body' },
              h('span', { class: 'pick-card__name truncate' }, cat.name),
              cat.description ? h('span', { class: 'pick-card__desc' }, cat.description) : null));
          b.addEventListener('click', () => {
            const i = state.categoryIds.indexOf(cat.id);
            if (i >= 0) state.categoryIds.splice(i, 1);
            else if (state.categoryIds.length >= max) {
              SJ.ui.toast(`يمكن اختيار ${max} فئات كحد أقصى في المباراة الواحدة.`, 'warning');
              return;
            } else state.categoryIds.push(cat.id);
            b.setAttribute('aria-pressed', String(state.categoryIds.includes(cat.id)));
            updateCounter();
            updateNext();
            SJ.sound.play('click');
          });
          return b;
        }));
        updateCounter();
        body.append(
          h('div', { class: 'pick-head' }, h('h2', { class: 'setup__question' }, 'اختر فئة أو أكثر'), counter),
          grid);
      }

      async function start() {
        if (!validateStep(3)) return;
        nextBtn.disabled = true;
        try {
          const players = state.mode === 'single'
            ? [{ name: state.singleName, color: config.SINGLE_PLAYER_COLOR }]
            : state.teams.map((t) => ({ name: t.name, color: t.color }));
          await Matches.create({ mode: state.mode, players, categoryIds: state.categoryIds.slice() });
          SJ.router.go('/game');
        } catch (err) {
          SJ.ui.toast(SJ.errorMessage(err), 'error');
          nextBtn.disabled = false;
        }
      }

      renderStep();
    },
  };
})(window.SJ);
