/* موجّه الصفحات بالـ hash (يعمل بفتح الملف مباشرة دون خادم)،
   مع حماية المسارات وتحذير التغييرات غير المحفوظة */
(function (SJ) {
  'use strict';

  const routes = [];
  let root = null;
  let current = null;
  let navId = 0;
  let ignoreNext = false;
  let lastHash = '#/';
  let dirtyCheck = null;

  function add(path, view, opts = {}) {
    const keys = [];
    const pattern = new RegExp('^' + path.replace(/:([a-zA-Z]+)/g, (_, k) => {
      keys.push(k);
      return '([^/]+)';
    }) + '/?$');
    routes.push({ pattern, keys, view, guard: opts.guard || null });
  }

  function parse(hash) {
    const raw = (hash || '').replace(/^#/, '') || '/';
    const [path, qs] = raw.split('?');
    const query = {};
    new URLSearchParams(qs || '').forEach((v, k) => { query[k] = v; });
    return { path: path || '/', query };
  }

  function currentPath() {
    return parse(location.hash).path;
  }

  function go(path, { replace = false } = {}) {
    const hash = '#' + path;
    if (location.hash === hash) {
      resolve();
      return;
    }
    if (replace) location.replace(hash);
    else location.hash = hash;
  }

  // تُسجّلها الشاشات التي تحتوي على نماذج تحرير
  function setLeaveGuard(fn) {
    dirtyCheck = fn;
  }

  async function resolve() {
    if (ignoreNext) {
      ignoreNext = false;
      return;
    }
    const id = ++navId;
    if (dirtyCheck && dirtyCheck()) {
      const ok = await SJ.ui.confirm({
        title: 'تغييرات غير محفوظة',
        message: 'لديك تغييرات لم تُحفظ بعد. هل تريد المغادرة وتجاهلها؟',
        confirmLabel: 'المغادرة دون حفظ',
        cancelLabel: 'البقاء في الصفحة',
        danger: true,
        icon: 'warning',
      });
      if (!ok) {
        if (location.hash !== lastHash) {
          ignoreNext = true;
          location.replace(lastHash);
        }
        return;
      }
    }
    if (id !== navId) return;
    dirtyCheck = null;

    const { path, query } = parse(location.hash);
    let match = null;
    for (const r of routes) {
      const m = r.pattern.exec(path);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        match = { route: r, params };
        break;
      }
    }
    if (!match) {
      go('/', { replace: true });
      return;
    }
    if (match.route.guard) {
      const redirect = await match.route.guard(match.params);
      if (id !== navId) return;
      if (redirect) {
        go(redirect, { replace: true });
        return;
      }
    }

    // إزالة الشاشة السابقة
    if (current && current.cleanup) {
      try { current.cleanup(); } catch (e) { console.error(e); }
    }
    current = null;
    lastHash = location.hash || '#/';
    const container = document.createElement('div');
    container.className = 'view';
    root.replaceChildren(container);
    window.scrollTo(0, 0);
    document.title = match.route.view.title ? `${match.route.view.title} — سين جيم` : 'سين جيم';

    try {
      const cleanup = await match.route.view.render(container, match.params, query);
      if (id !== navId) {
        if (typeof cleanup === 'function') cleanup();
        return;
      }
      current = { cleanup: typeof cleanup === 'function' ? cleanup : null };
    } catch (err) {
      console.error(err);
      if (id !== navId) return;
      container.replaceChildren(SJ.views.common.emptyState({
        icon: 'warning',
        title: 'تعذّر عرض الصفحة',
        text: SJ.errorMessage(err),
        actions: [SJ.views.common.linkButton('الصفحة الرئيسية', '/', 'primary', 'home')],
      }));
    }
    root.focus({ preventScroll: true });
  }

  function start(rootEl) {
    root = rootEl;
    window.addEventListener('hashchange', resolve);
    window.addEventListener('beforeunload', (e) => {
      if (dirtyCheck && dirtyCheck()) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    resolve();
  }

  SJ.router = { add, go, start, setLeaveGuard, currentPath };
})(window.SJ);
