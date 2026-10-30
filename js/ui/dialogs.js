/* النوافذ المنبثقة، التأكيد، الاختيار، ورسائل Toast */
(function (SJ) {
  'use strict';

  const { h, icon } = SJ.dom;
  const stack = [];

  function focusables(root) {
    return Array.from(root.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter((el) => el.offsetParent !== null);
  }

  /* فتح نافذة منبثقة.
     actions: [{ label, variant, icon, value, onClick(api) }] — إن أعادت onClick القيمة false تبقى النافذة مفتوحة */
  function modal(opts) {
    const { title, body, actions = [], size = 'md', dismissible = true, onClose, className, initialFocus } = opts;
    const prevFocus = document.activeElement;
    const titleId = SJ.utils.uid('mt');
    let closed = false;
    let resolveClosed;
    const closedPromise = new Promise((r) => { resolveClosed = r; });

    const bodyEl = h('div', { class: 'modal__body' }, body);
    const actionsEl = h('div', { class: 'modal__actions' });
    const closeBtn = dismissible
      ? h('button', { type: 'button', class: 'icon-btn modal__close', 'aria-label': 'إغلاق', onclick: () => api.close(null) }, icon('x'))
      : null;
    const dialog = h('div', {
      class: ['modal', `modal--${size}`, className],
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': title ? titleId : null,
      tabIndex: -1,
    },
    title ? h('header', { class: 'modal__header' }, h('h2', { id: titleId, class: 'modal__title' }, title), closeBtn) : closeBtn,
    bodyEl,
    actions.length ? actionsEl : null);
    const backdrop = h('div', { class: 'modal-backdrop' }, dialog);

    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop && dismissible) api.close(null);
    });
    dialog.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = focusables(dialog);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    const buttons = actions.map((a) => {
      const btn = h('button', { type: 'button', class: ['btn', `btn--${a.variant || 'secondary'}`], disabled: !!a.disabled }, a.icon ? icon(a.icon) : null, h('span', null, a.label));
      btn.addEventListener('click', async () => {
        if (a.onClick) {
          setBusy(true);
          let result;
          try {
            result = await a.onClick(api);
          } catch (err) {
            console.error(err);
            toast(SJ.errorMessage(err), 'error');
            result = false;
          }
          if (!closed) setBusy(false);
          if (result === false) return;
        }
        api.close(a.value !== undefined ? a.value : null);
      });
      actionsEl.append(btn);
      return btn;
    });

    function setBusy(busy) {
      buttons.forEach((b) => { b.disabled = busy; });
      dialog.classList.toggle('is-busy', busy);
    }

    const popKeys = SJ.shortcuts.push({
      exclusive: true,
      allowInInputs: ['esc'],
      handlers: { esc: () => { if (dismissible) api.close(null); } },
    });

    const api = {
      el: dialog,
      body: bodyEl,
      buttons,
      setBusy,
      closed: closedPromise,
      close(result) {
        if (closed) return;
        closed = true;
        popKeys();
        stack.splice(stack.indexOf(api), 1);
        backdrop.classList.remove('is-open');
        backdrop.classList.add('is-leaving');
        setTimeout(() => backdrop.remove(), SJ.utils.prefersReducedMotion() ? 0 : 220);
        document.body.classList.toggle('has-modal', stack.length > 0);
        if (prevFocus && prevFocus.isConnected && prevFocus.focus) prevFocus.focus({ preventScroll: true });
        if (onClose) onClose(result);
        resolveClosed(result);
      },
    };

    stack.push(api);
    document.body.append(backdrop);
    document.body.classList.add('has-modal');
    requestAnimationFrame(() => {
      backdrop.classList.add('is-open');
      const target = initialFocus || focusables(bodyEl)[0] || buttons[0] || dialog;
      target.focus({ preventScroll: true });
    });
    return api;
  }

  function confirm({ title = 'تأكيد', message, details, confirmLabel = 'تأكيد', cancelLabel = 'إلغاء', danger = false, icon: iconName }) {
    const body = h('div', { class: 'confirm' },
      iconName ? h('div', { class: ['confirm__icon', danger && 'is-danger'] }, icon(iconName)) : null,
      h('p', { class: 'confirm__msg' }, message),
      details ? h('p', { class: 'confirm__details' }, details) : null);
    return modal({
      title,
      body,
      size: 'sm',
      actions: [
        { label: confirmLabel, variant: danger ? 'danger' : 'primary', value: true },
        { label: cancelLabel, variant: 'ghost', value: false },
      ],
    }).closed.then((v) => v === true);
  }

  function choice({ title, message, options, dismissible = true }) {
    return modal({
      title,
      body: h('p', { class: 'confirm__msg' }, message),
      size: 'sm',
      dismissible,
      actions: options.map((o) => ({ label: o.label, variant: o.variant || 'secondary', icon: o.icon, value: o.value })),
    }).closed;
  }

  function alertBox({ title, message, body }) {
    return modal({ title, body: body || h('p', { class: 'confirm__msg' }, message), size: 'sm', actions: [{ label: 'حسنًا', variant: 'primary' }] }).closed;
  }

  const TOAST_ICONS = { success: 'check', error: 'warning', warning: 'warning', info: 'info' };

  function toast(message, type = 'info', { duration = 3800, action = null } = {}) {
    let host = document.getElementById('toasts');
    if (!host) {
      host = h('div', { id: 'toasts', class: 'toasts', 'aria-live': 'polite' });
      document.body.append(host);
    }
    const el = h('div', { class: ['toast', `toast--${type}`], role: type === 'error' ? 'alert' : 'status' },
      icon(TOAST_ICONS[type] || 'info'),
      h('span', { class: 'toast__msg' }, message),
      action ? h('button', { type: 'button', class: 'toast__action', onclick: () => { action.onClick(); dismiss(); } }, action.label) : null,
      h('button', { type: 'button', class: 'toast__close', 'aria-label': 'إغلاق الرسالة', onclick: () => dismiss() }, icon('x')));
    host.append(el);
    requestAnimationFrame(() => el.classList.add('is-in'));
    const timer = setTimeout(dismiss, type === 'error' ? duration * 1.8 : duration);
    function dismiss() {
      clearTimeout(timer);
      el.classList.remove('is-in');
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 260);
    }
    return dismiss;
  }

  Object.assign(SJ.ui, { modal, confirm, choice, alert: alertBox, toast });
})(window.SJ);
