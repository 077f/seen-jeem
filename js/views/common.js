/* مكونات مشتركة بين الشاشات: حقول النماذج، مفاتيح التبديل، اختيار الألوان،
   الحالة الفارغة، هيكل لوحة الأدمن، نافذة الاختصارات، سؤال استكمال المباراة */
(function (SJ) {
  'use strict';

  const { h, icon } = SJ.dom;
  const { utils } = SJ;

  // حقل نموذج مع عنوان وعدّاد أحرف ورسالة خطأ
  // control: عنصر بديل يُعرض مكان الحقل (مثل حقل كلمة المرور مع زر الإظهار)
  function field({ label, input, control, required = false, hint, counterMax }) {
    if (!input.id) input.id = utils.uid('f');
    const errorId = `${input.id}-err`;
    const errorEl = h('div', { class: 'field__error', id: errorId, role: 'alert' });
    const counterEl = counterMax ? h('span', { class: 'field__counter' }) : null;
    const updateCounter = () => {
      if (!counterEl) return;
      const n = utils.countChars(input.value);
      counterEl.textContent = `${n} / ${counterMax}`;
      counterEl.classList.toggle('is-over', n > counterMax);
    };
    if (counterEl) {
      input.addEventListener('input', updateCounter);
      updateCounter();
    }
    input.setAttribute('aria-describedby', errorId);
    const el = h('div', { class: 'field' },
      h('label', { class: 'field__label', for: input.id },
        h('span', null, label, required ? h('span', { class: 'field__req', 'aria-hidden': 'true' }, ' *') : null),
        counterEl),
      control || input,
      hint ? h('div', { class: 'field__hint' }, hint) : null,
      errorEl);
    return {
      el,
      input,
      updateCounter,
      setError(msg) {
        errorEl.textContent = msg || '';
        el.classList.toggle('is-invalid', !!msg);
        input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      },
    };
  }

  function switchToggle({ label, checked = false, onChange, disabled = false, description }) {
    const input = h('input', { type: 'checkbox', role: 'switch', checked, disabled });
    input.addEventListener('change', () => onChange && onChange(input.checked));
    const el = h('label', { class: ['switch', disabled && 'is-disabled'] },
      input,
      h('span', { class: 'switch__track' }, h('span', { class: 'switch__thumb' })),
      label ? h('span', null, label) : null);
    if (description) el.title = description;
    return {
      el,
      input,
      set(v) { input.checked = !!v; },
      setDisabled(d) {
        input.disabled = d;
        el.classList.toggle('is-disabled', d);
      },
    };
  }

  // اختيار لون من قائمة مع لون مخصص
  function swatches({ colors, value, onChange, allowCustom = true, label = 'اللون' }) {
    let current = value;
    const el = h('div', { class: 'swatches', role: 'group', 'aria-label': label });
    const buttons = colors.map((c) => {
      const b = h('button', { type: 'button', class: 'swatch', style: { '--sw': c }, 'aria-label': `اللون ${c}`, title: c });
      b.addEventListener('click', () => setValue(c, true));
      el.append(b);
      return b;
    });
    let customInput = null;
    if (allowCustom) {
      customInput = h('input', { type: 'color', value: SJ.validate.isHexColor(value) ? value : colors[0], 'aria-label': 'لون مخصص' });
      customInput.addEventListener('input', () => setValue(customInput.value, true));
      el.append(h('label', { class: 'swatch-custom', title: 'لون مخصص' }, icon('plus'), customInput));
    }
    function setValue(c, notify) {
      current = c;
      buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(colors[i].toLowerCase() === String(c).toLowerCase())));
      if (notify && onChange) onChange(c);
    }
    setValue(value, false);
    return { el, setValue: (c) => setValue(c, false), get: () => current };
  }

  function segmented({ options, value, onChange, label }) {
    const el = h('div', { class: 'segmented', role: 'group', 'aria-label': label });
    const btns = options.map((o) => {
      const b = h('button', { type: 'button' }, o.label);
      b.addEventListener('click', () => {
        set(o.value);
        if (onChange) onChange(o.value);
      });
      el.append(b);
      return b;
    });
    function set(v) {
      btns.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === v)));
    }
    set(value);
    return { el, set };
  }

  function linkButton(label, path, variant = 'secondary', iconName = null, size = '') {
    return h('a', { class: ['btn', `btn--${variant}`, size && `btn--${size}`], href: `#${path}` }, iconName ? icon(iconName) : null, h('span', null, label));
  }

  function emptyState({ icon: iconName = 'info', title, text, actions = [] }) {
    return h('div', { class: 'empty-state' },
      h('div', { class: 'empty-state__icon' }, icon(iconName)),
      h('h2', { class: 'empty-state__title' }, title),
      text ? h('p', { class: 'muted' }, text) : null,
      actions.length ? h('div', { class: 'empty-state__actions' }, actions) : null);
  }

  function banner({ type = 'info', icon: iconName = 'info', text, actions = [] }) {
    return h('div', { class: ['banner', `banner--${type}`], role: type === 'danger' ? 'alert' : 'status' },
      icon(iconName),
      h('div', { class: 'banner__body' }, h('div', null, text), actions.length ? h('div', { class: 'banner__actions' }, actions) : null));
  }

  function loading() {
    return h('div', { class: 'loading', 'aria-busy': 'true' }, h('span', { class: 'spinner', 'aria-label': 'جارٍ التحميل' }));
  }

  // زر كتم الصوت يحدّث شكله بنفسه
  function muteButton({ withLabel = false } = {}) {
    const btn = h('button', { type: 'button', class: withLabel ? 'btn btn--ghost' : 'icon-btn' });
    const render = () => {
      const on = SJ.sound.isEnabled();
      const label = on ? 'كتم الصوت (M)' : 'تشغيل الصوت (M)';
      btn.replaceChildren(icon(on ? 'volume' : 'mute'));
      if (withLabel) btn.append(h('span', null, on ? 'الصوت' : 'مكتوم'));
      btn.setAttribute('aria-label', label);
      btn.title = label;
    };
    btn.toggle = async () => {
      await SJ.sound.toggle();
      render();
    };
    btn.addEventListener('click', btn.toggle);
    const off = SJ.events.on('settings', render);
    btn.dispose = off;
    render();
    return btn;
  }

  function showShortcuts() {
    if (document.querySelector('.modal--shortcuts')) return;
    const list = h('ul', { class: 'shortcut-list' }, SJ.shortcuts.HELP.map((s) => h('li', null,
      h('span', null, s.desc),
      h('span', { class: 'shortcut-list__keys' }, s.keys.map((k) => h('kbd', { class: 'kbd' }, k))))));
    SJ.ui.modal({
      title: 'اختصارات لوحة المفاتيح',
      body: h('div', { class: 'form-stack' }, list, h('p', { class: 'field__hint' }, 'الاختصارات تعمل مع لوحة المفاتيح العربية والإنجليزية.')),
      size: 'md',
      className: 'modal--shortcuts',
      actions: [{ label: 'حسنًا', variant: 'primary' }],
    });
  }

  const playersLabel = (match) => match.players.map((p) => p.name).join(' ضد ');

  /* سؤال استكمال المباراة السابقة أو بدء جديدة. يعيد 'resume' أو 'new' */
  async function promptResume(match) {
    const answered = match.usedQuestionIds.length;
    const total = SJ.engine.totalQuestions(match);
    const choice = await SJ.ui.choice({
      title: 'مباراة غير مكتملة',
      message: `توجد مباراة جارية (${playersLabel(match)}) بدأت ${utils.formatDateTime(match.startedAt)}، وتمت الإجابة على ${answered} من ${total} سؤالًا. هل تريد استكمالها أم بدء مباراة جديدة؟`,
      dismissible: false,
      options: [
        { label: 'استكمال المباراة السابقة', value: 'resume', variant: 'primary', icon: 'play' },
        { label: 'بدء مباراة جديدة', value: 'new', variant: 'ghost', icon: 'restart' },
      ],
    });
    if (choice !== 'new') return 'resume';
    const sure = await SJ.ui.confirm({
      title: 'بدء مباراة جديدة؟',
      message: 'ستُلغى المباراة الحالية ويضيع تقدّمها. هل أنت متأكد؟',
      confirmLabel: 'نعم، ابدأ من جديد',
      cancelLabel: 'رجوع',
      danger: true,
      icon: 'warning',
    });
    if (!sure) return promptResume(match);
    await SJ.repo.Matches.abandonActive();
    return 'new';
  }

  /* هيكل صفحات الأدمن: شريط علوي + عنوان الصفحة. يعيد عنصر المحتوى */
  function adminShell(container, { active, title, back, actions = [] }) {
    const nav = [
      { path: '/admin', label: 'الفئات', icon: 'grid' },
      { path: '/admin/settings', label: 'الإعدادات', icon: 'settings' },
    ];
    const header = h('header', { class: 'admin-header' },
      h('a', { class: 'brand', href: '#/', 'aria-label': 'سين جيم — الصفحة الرئيسية' }, h('span', { class: 'brand__mark' }, 'س ج'), h('span', null, 'سين جيم')),
      h('nav', { class: 'admin-nav', 'aria-label': 'قائمة الأدمن' }, nav.map((n) => h('a', { href: `#${n.path}`, 'aria-current': n.path === active ? 'page' : null }, icon(n.icon), n.label))),
      h('div', { class: 'admin-header__actions' },
        linkButton('ابدأ اللعب', '/play', 'primary', 'play', 'sm'),
        h('button', {
          type: 'button',
          class: 'btn btn--ghost btn--sm',
          onclick: () => {
            SJ.auth.logout();
            SJ.ui.toast('تم تسجيل الخروج.', 'info');
            SJ.router.go('/');
          },
        }, icon('logout'), h('span', null, 'خروج'))));
    const content = h('main', { class: 'admin-main', id: 'main' });
    if (title) {
      content.append(h('div', { class: 'page-head' },
        h('div', { class: 'page-head__start' },
          back ? h('a', { class: 'icon-btn', href: `#${back}`, 'aria-label': 'رجوع' }, icon('arrowRight')) : null,
          h('h1', { class: 'page-title truncate' }, title)),
        actions.length ? h('div', { class: 'page-head__actions' }, actions) : null));
    }
    container.append(h('div', { class: 'admin' }, header, content));
    return content;
  }

  SJ.views.common = { field, switchToggle, swatches, segmented, linkButton, emptyState, banner, loading, muteButton, showShortcuts, promptResume, playersLabel, adminShell };
})(window.SJ);
