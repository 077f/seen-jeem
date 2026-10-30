/* الإعدادات: إعدادات اللعب، كلمة المرور، التصدير والاستيراد، البيانات التجريبية، مساحة التخزين */
(function (SJ) {
  'use strict';

  const { h, icon } = SJ.dom;
  const { utils, config } = SJ;
  const { Settings } = SJ.repo;
  const C = SJ.views.common;

  function settingRow(title, description, control) {
    return h('div', { class: 'setting-row' },
      h('div', { class: 'setting-row__text' }, h('span', { class: 'setting-row__title' }, title), description ? h('span', { class: 'field__hint' }, description) : null),
      control);
  }

  async function saveSetting(patch, message) {
    try {
      await Settings.update(patch);
      SJ.ui.toast(message || 'تم حفظ الإعداد.', 'success', { duration: 2000 });
    } catch (err) {
      SJ.ui.toast(SJ.errorMessage(err), 'error');
    }
  }

  function gameSettingsPanel() {
    const s = Settings.get();
    const timer = C.segmented({
      label: 'مدة المؤقت',
      value: s.timerSeconds,
      options: config.TIMER_OPTIONS.map((v) => ({ value: v, label: v === 0 ? 'بدون' : `${v} ث` })),
      onChange: (v) => saveSetting({ timerSeconds: v }, v === 0 ? 'تم إلغاء المؤقت.' : `مدة المؤقت: ${v} ثانية.`),
    });
    const sounds = C.switchToggle({ checked: s.sounds, onChange: (v) => saveSetting({ sounds: v }, v ? 'تم تشغيل الأصوات.' : 'تم كتم الأصوات.') });
    const deduct = C.switchToggle({ checked: s.deductOnWrong, onChange: (v) => saveSetting({ deductOnWrong: v }) });
    const steal = C.switchToggle({ checked: s.allowSteal, onChange: (v) => saveSetting({ allowSteal: v }) });
    const off = SJ.events.on('settings', (next) => sounds.set(next.sounds));
    const panel = h('section', { class: 'panel' },
      h('h2', { class: 'panel__title' }, h('span', null, icon('sliders'), ' إعدادات اللعب')),
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'مدة المؤقت الافتراضية لكل سؤال'), timer.el),
      h('div', null,
        settingRow('الأصوات', 'أصوات فتح السؤال والمؤقت والإجابات والفوز.', sounds.el),
        settingRow('خصم النقاط عند الخطأ', 'عند الإجابة الخاطئة تُخصم قيمة السؤال من صاحب الدور.', deduct.el),
        settingRow('فرصة السرقة', 'في وضع الفريقين: إذا أخطأ صاحب الدور يمكن للفريق الآخر الإجابة وأخذ النقاط.', steal.el)),
      h('p', { class: 'field__hint' }, 'تُطبَّق التغييرات على المباريات الجديدة. المباراة الجارية تحتفظ بإعداداتها التي بدأت بها.'));
    panel.dispose = off;
    return panel;
  }

  function passwordPanel() {
    const mk = (autocomplete) => h('input', { class: 'input', type: 'password', autocomplete, maxLength: 64, dir: 'ltr' });
    const current = mk('current-password');
    const next = mk('new-password');
    const confirm = mk('new-password');
    const fCurrent = C.field({ label: 'كلمة المرور الحالية', input: current, required: true });
    const fNext = C.field({ label: 'كلمة المرور الجديدة', input: next, required: true, hint: '6 أحرف على الأقل.' });
    const fConfirm = C.field({ label: 'تأكيد كلمة المرور الجديدة', input: confirm, required: true });
    const submit = h('button', { type: 'submit', class: 'btn btn--primary' }, icon('lock'), 'تغيير كلمة المرور');
    const form = h('form', { class: 'form-stack', novalidate: true }, fCurrent.el, fNext.el, fConfirm.el, h('div', null, submit));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      [fCurrent, fNext, fConfirm].forEach((f) => f.setError(''));
      if (!current.value) return fCurrent.setError('أدخل كلمة المرور الحالية.');
      if (next.value.length < 6) return fNext.setError('كلمة المرور الجديدة يجب أن تتكون من 6 أحرف على الأقل.');
      if (next.value !== confirm.value) return fConfirm.setError('تأكيد كلمة المرور غير مطابق.');
      submit.disabled = true;
      try {
        await SJ.auth.changePassword(current.value, next.value, confirm.value);
        form.reset();
        SJ.ui.toast('تم تغيير كلمة المرور بنجاح.', 'success');
      } catch (err) {
        if (err.code === 'WRONG_PASSWORD') fCurrent.setError(SJ.errorMessage(err));
        else SJ.ui.toast(SJ.errorMessage(err), 'error');
      } finally {
        submit.disabled = false;
      }
    });
    return h('section', { class: 'panel' },
      h('h2', { class: 'panel__title' }, h('span', null, icon('shield'), ' كلمة مرور الأدمن')),
      C.banner({ type: 'warning', icon: 'info', text: 'هذه النسخة تعمل محليًا داخل المتصفح، لذا فكلمة المرور حماية شكلية تمنع العبث العرضي فقط، وليست حماية أمنية حقيقية.' }),
      form);
  }

  function backupPanel(rerender) {
    const exportBtn = h('button', { type: 'button', class: 'btn btn--primary' }, icon('download'), 'تصدير كل المحتوى (JSON)');
    exportBtn.addEventListener('click', async () => {
      exportBtn.disabled = true;
      try {
        const res = await SJ.transfer.exportAll();
        SJ.ui.toast(`تم التصدير: ${res.categories} فئة و${res.questions} سؤال (${utils.formatBytes(res.bytes)}).`, 'success', { duration: 5000 });
      } catch (err) {
        SJ.ui.toast(SJ.errorMessage(err), 'error');
      } finally {
        exportBtn.disabled = false;
      }
    });

    const fileInput = h('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', tabIndex: -1 });
    const importBtn = h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => fileInput.click() }, icon('upload'), 'استيراد من ملف…');
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      importBtn.disabled = true;
      try {
        const parsed = await SJ.transfer.parseFile(file);
        await confirmImport(parsed, rerender);
      } catch (err) {
        showImportErrors(err);
      } finally {
        importBtn.disabled = false;
      }
    });

    return h('section', { class: 'panel' },
      h('h2', { class: 'panel__title' }, h('span', null, icon('database'), ' النسخ الاحتياطي')),
      h('p', { class: 'muted' }, 'صدّر كل الفئات والأسئلة والصور في ملف واحد لحفظه أو نقله إلى جهاز آخر، ثم استورده من هنا.'),
      h('div', { class: 'banner__actions' }, exportBtn, importBtn, fileInput));
  }

  function showImportErrors(err) {
    const errors = (err.details && err.details.errors) || [];
    const shown = errors.slice(0, 15);
    SJ.ui.alert({
      title: 'تعذّر الاستيراد',
      body: h('div', { class: 'form-stack' },
        h('p', { class: 'confirm__msg' }, SJ.errorMessage(err)),
        shown.length ? h('ul', { class: 'error-list' }, shown.map((e) => h('li', null, e))) : null,
        errors.length > shown.length ? h('p', { class: 'muted' }, `و${errors.length - shown.length} أخطاء أخرى.`) : null,
        h('p', { class: 'field__hint' }, 'لم يتغير أي شيء في المحتوى الحالي.')),
    });
  }

  async function confirmImport(parsed, rerender) {
    let mode = 'merge';
    const radio = (value, title, desc, checked) => {
      const input = h('input', { type: 'radio', name: 'import-mode', value, checked });
      input.addEventListener('change', () => { mode = value; });
      return h('label', { class: 'radio-card' }, input, h('span', null, h('strong', null, title), h('br'), h('span', { class: 'field__hint' }, desc)));
    };
    const s = parsed.summary;
    const body = h('div', { class: 'form-stack' },
      h('p', { class: 'confirm__msg' }, `الملف سليم ويحتوي على ${s.categories} فئة و${s.questions} سؤال و${s.images} صورة.`),
      parsed.exportedAt ? h('p', { class: 'field__hint' }, `تاريخ التصدير: ${utils.formatDateTime(parsed.exportedAt)}`) : null,
      h('div', { class: 'radio-cards', role: 'radiogroup', 'aria-label': 'طريقة الاستيراد' },
        radio('merge', 'دمج مع المحتوى الحالي', 'الفئات الجديدة تُضاف، والفئة التي لها نفس الاسم تُستبدل بمحتوى الملف، وباقي فئاتك تبقى كما هي.', true),
        radio('replace', 'استبدال كل المحتوى', 'يُحذف كل المحتوى الحالي نهائيًا ويُوضع محتوى الملف مكانه (مع إعدادات اللعب).', false)));
    await SJ.ui.modal({
      title: 'استيراد المحتوى',
      body,
      size: 'md',
      actions: [
        {
          label: 'استيراد',
          variant: 'primary',
          icon: 'upload',
          onClick: async () => {
            if (mode === 'replace') {
              const ok = await SJ.ui.confirm({ title: 'استبدال كل المحتوى؟', message: 'سيُحذف كل المحتوى الحالي نهائيًا. ننصح بتصدير نسخة احتياطية أولًا.', confirmLabel: 'استبدال', danger: true, icon: 'warning' });
              if (!ok) return false;
            }
            const res = await SJ.transfer.applyImport(parsed, mode);
            SJ.ui.toast(`تم الاستيراد: ${res.added} فئة جديدة، ${res.updated} فئة مستبدلة، ${res.questions} سؤال.`, 'success', { duration: 5000 });
            rerender();
            return true;
          },
        },
        { label: 'إلغاء', variant: 'ghost' },
      ],
    }).closed;
  }

  async function samplesPanel(rerender) {
    const count = await SJ.seed.count();
    const installBtn = h('button', { type: 'button', class: 'btn btn--secondary' }, icon('star'), 'إضافة الفئات التجريبية');
    const removeBtn = h('button', { type: 'button', class: 'btn btn--ghost', disabled: count === 0 }, icon('trash'), 'حذف الفئات التجريبية');
    installBtn.addEventListener('click', async () => {
      installBtn.disabled = true;
      try {
        const added = await SJ.seed.install();
        SJ.ui.toast(added ? `تمت إضافة ${added} فئة تجريبية.` : 'الفئات التجريبية موجودة بالفعل.', added ? 'success' : 'info');
        rerender();
      } catch (err) {
        SJ.ui.toast(SJ.errorMessage(err), 'error');
        installBtn.disabled = false;
      }
    });
    removeBtn.addEventListener('click', async () => {
      const ok = await SJ.ui.confirm({ title: 'حذف الفئات التجريبية؟', message: `سيتم حذف ${count} فئة تجريبية (جغرافيا، علوم، رياضة) مع أسئلتها. فئاتك الخاصة لن تتأثر.`, confirmLabel: 'حذف', danger: true, icon: 'trash' });
      if (!ok) return;
      try {
        const removed = await SJ.seed.removeAll();
        SJ.ui.toast(`تم حذف ${removed} فئة تجريبية.`, 'success');
        rerender();
      } catch (err) {
        SJ.ui.toast(SJ.errorMessage(err), 'error');
      }
    });
    return h('section', { class: 'panel' },
      h('h2', { class: 'panel__title' }, h('span', null, icon('star'), ' البيانات التجريبية')),
      h('p', { class: 'muted' }, count ? `يوجد حاليًا ${count} فئة تجريبية لتجربة اللعبة فورًا.` : 'لا توجد فئات تجريبية حاليًا.'),
      h('div', { class: 'banner__actions' }, installBtn, removeBtn));
  }

  async function storagePanel() {
    const panel = h('section', { class: 'panel' }, h('h2', { class: 'panel__title' }, h('span', null, icon('database'), ' مساحة التخزين')));
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const { usage = 0, quota = 0 } = await navigator.storage.estimate();
        const pct = quota ? Math.min(100, (usage / quota) * 100) : 0;
        panel.append(
          h('p', null, `المستخدم: ${utils.formatBytes(usage)}${quota ? ` من ${utils.formatBytes(quota)} متاحة للمتصفح` : ''}`),
          h('div', { class: 'storage-meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct)) }, h('span', { style: { width: `${Math.max(pct, 1)}%` } })));
      } catch (e) { /* غير متاح */ }
    }
    let persisted = null;
    if (navigator.storage && navigator.storage.persisted) {
      try { persisted = await navigator.storage.persisted(); } catch (e) { persisted = null; }
    }
    panel.append(h('p', { class: 'field__hint' },
      'المحتوى محفوظ داخل هذا المتصفح على هذا الجهاز فقط. إذا مسحت بيانات المتصفح أو نقلت مجلد اللعبة لمكان آخر سيختفي، لذلك صدّر نسخة احتياطية بانتظام.',
      persisted === true ? ' (المتصفح يحمي هذه البيانات من الحذف التلقائي.)' : ''));
    return panel;
  }

  SJ.views.settings = {
    title: 'الإعدادات',
    async render(container) {
      const content = C.adminShell(container, { active: '/admin/settings', title: 'الإعدادات' });
      const grid = h('div', { class: 'settings-grid' });
      content.append(grid);
      const rerender = () => SJ.router.go('/admin/settings');
      const gamePanel = gameSettingsPanel();
      const [samples, storage] = await Promise.all([samplesPanel(rerender), storagePanel()]);
      grid.append(gamePanel, passwordPanel(), backupPanel(rerender), samples, storage);
      return () => gamePanel.dispose();
    },
  };
})(window.SJ);
