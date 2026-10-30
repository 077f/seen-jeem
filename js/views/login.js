/* تسجيل دخول الأدمن: رسالة خطأ عامة، قفل مؤقت بعد 5 محاولات فاشلة */
(function (SJ) {
  'use strict';

  const { h, icon } = SJ.dom;
  const C = SJ.views.common;

  SJ.views.login = {
    title: 'دخول الأدمن',
    async render(container) {
      if (SJ.auth.isLoggedIn()) {
        SJ.router.go('/admin', { replace: true });
        return;
      }
      const info = await SJ.auth.info();
      let lockTimer = null;

      const user = h('input', { class: 'input', name: 'username', autocomplete: 'username', maxLength: 40, required: true, dir: 'ltr', spellcheck: 'false', autocapitalize: 'none' });
      const pass = h('input', { class: 'input', name: 'password', type: 'password', autocomplete: 'current-password', maxLength: 64, required: true, dir: 'ltr' });
      const toggle = h('button', { type: 'button', class: 'input-group__btn', 'aria-label': 'إظهار كلمة المرور', 'aria-pressed': 'false' }, icon('eye'));
      toggle.addEventListener('click', () => {
        const show = pass.type === 'password';
        pass.type = show ? 'text' : 'password';
        toggle.replaceChildren(icon(show ? 'eyeOff' : 'eye'));
        toggle.setAttribute('aria-label', show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
        toggle.setAttribute('aria-pressed', String(show));
        pass.focus();
      });
      const userField = C.field({ label: 'اسم المستخدم', input: user, required: true });
      const passField = C.field({ label: 'كلمة المرور', input: pass, control: h('div', { class: 'input-group' }, pass, toggle), required: true });
      const errorBox = h('div', { class: 'banner banner--danger', role: 'alert', hidden: true });
      const submit = h('button', { type: 'submit', class: 'btn btn--primary btn--lg btn--block' }, icon('lock'), h('span', null, 'دخول'));

      function showError(msg) {
        errorBox.replaceChildren(icon('warning'), h('div', { class: 'banner__body' }, msg));
        errorBox.hidden = false;
      }

      function startLockCountdown(ms) {
        clearInterval(lockTimer);
        const until = Date.now() + ms;
        submit.disabled = true;
        const tick = () => {
          const left = until - Date.now();
          if (left <= 0) {
            clearInterval(lockTimer);
            submit.disabled = false;
            errorBox.hidden = true;
            return;
          }
          const m = Math.floor(left / 60000);
          const s = Math.ceil((left % 60000) / 1000);
          showError(`تم إيقاف تسجيل الدخول مؤقتًا بسبب كثرة المحاولات الفاشلة. حاول بعد ${m}:${String(s === 60 ? 0 : s).padStart(2, '0')}`);
        };
        tick();
        lockTimer = setInterval(tick, 1000);
      }

      const form = h('form', { class: 'form-stack', novalidate: true }, errorBox, userField.el, passField.el, submit);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorBox.hidden = true;
        if (!user.value.trim() || !pass.value) {
          showError('أدخل اسم المستخدم وكلمة المرور.');
          (user.value.trim() ? pass : user).focus();
          return;
        }
        submit.disabled = true;
        try {
          const res = await SJ.auth.login(user.value, pass.value);
          SJ.ui.toast('أهلًا بك في لوحة الأدمن.', 'success');
          if (res.isDefaultPassword) SJ.ui.toast('ما زلت تستخدم كلمة المرور الافتراضية. غيّرها من الإعدادات.', 'warning', { duration: 6000 });
          const next = SJ.state.afterLogin && SJ.state.afterLogin.startsWith('/admin') ? SJ.state.afterLogin : '/admin';
          SJ.state.afterLogin = null;
          SJ.router.go(next, { replace: true });
        } catch (err) {
          pass.value = '';
          if (err.code === 'LOCKED') {
            startLockCountdown(err.details.remainingMs);
            return;
          }
          let msg = SJ.errorMessage(err);
          if (err.code === 'BAD_CREDENTIALS' && err.details && err.details.attemptsLeft <= 2) {
            msg += ` (متبقٍ ${err.details.attemptsLeft === 1 ? 'محاولة واحدة' : 'محاولتان'} قبل القفل المؤقت)`;
          }
          showError(msg);
          pass.focus();
          submit.disabled = false;
        }
      });

      container.append(h('div', { class: 'auth' },
        h('div', { class: 'auth__card' },
          h('div', { class: 'auth__head' },
            h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand__mark' }, 'س ج'), h('span', null, 'سين جيم')),
            h('h1', { class: 'page-title' }, 'دخول لوحة الأدمن')),
          form,
          info && info.isDefaultPassword
            ? C.banner({ type: 'info', icon: 'info', text: `أول مرة؟ بيانات الدخول الافتراضية: اسم المستخدم ${SJ.auth.DEFAULT_USERNAME} وكلمة المرور ${SJ.auth.DEFAULT_PASSWORD} — غيّرها من الإعدادات بعد الدخول.` })
            : null,
          h('p', { class: 'auth__note' }, 'تنبيه: هذه النسخة تعمل محليًا داخل المتصفح على هذا الجهاز، لذا فكلمة المرور حماية شكلية تمنع العبث العرضي فقط، وليست حماية أمنية حقيقية.'),
          C.linkButton('الرجوع للرئيسية', '/', 'ghost', 'arrowRight'))));

      const remaining = await SJ.auth.lockRemaining();
      if (remaining > 0) startLockCountdown(remaining);
      setTimeout(() => user.focus(), 50);
      return () => clearInterval(lockTimer);
    },
  };
})(window.SJ);
