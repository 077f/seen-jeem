/* تشغيل التطبيق: فتح التخزين، تجهيز الأدمن والبيانات التجريبية، تسجيل المسارات،
   واستعادة المباراة الجارية بعد تحديث الصفحة */
(function (SJ) {
  'use strict';

  const { h } = SJ.dom;
  const V = SJ.views;

  // حماية مسارات الأدمن
  function adminGuard() {
    if (SJ.auth.isLoggedIn()) return null;
    SJ.state.afterLogin = SJ.router.currentPath();
    return '/login';
  }

  function registerRoutes() {
    const r = SJ.router;
    r.add('/', V.home);
    r.add('/login', V.login);
    r.add('/admin', V.dashboard, { guard: adminGuard });
    r.add('/admin/settings', V.settings, { guard: adminGuard });
    r.add('/admin/category/new', V.categoryEditor, { guard: adminGuard });
    r.add('/admin/category/:id/preview', V.categoryPreview, { guard: adminGuard });
    r.add('/admin/category/:id', V.categoryEditor, { guard: adminGuard });
    r.add('/play', V.setup);
    r.add('/game', V.game);
    r.add('/results/:id', V.results);
  }

  function renderFatal(root, err) {
    console.error(err);
    root.replaceChildren(h('div', { class: 'fatal' }, V.common.emptyState({
      icon: 'warning',
      title: 'تعذّر تشغيل اللعبة',
      text: SJ.errorMessage(err),
      actions: [h('button', { type: 'button', class: 'btn btn--primary', onclick: () => location.reload() }, 'إعادة المحاولة')],
    })));
  }

  // ميزات التطبيق القابل للتثبيت (PWA) تعمل فقط عند التشغيل من خادم http/https
  function registerPWA() {
    if (!/^https?:$/.test(location.protocol)) return;
    document.head.append(h('link', { rel: 'manifest', href: 'manifest.webmanifest' }));
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('[sw]', e));
    }
  }

  async function requestPersistence() {
    try {
      if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) {
        await navigator.storage.persist();
      }
    } catch (e) { /* غير مدعوم */ }
  }

  async function boot() {
    const root = document.getElementById('app');
    root.replaceChildren(V.common.loading());
    try {
      await SJ.db.open();
      await SJ.repo.Settings.load();
      await SJ.auth.ensureAdmin();
      try {
        await SJ.seed.ensureInitial();
      } catch (e) {
        console.warn('[seed]', e);
      }
    } catch (err) {
      renderFatal(root, err);
      return;
    }

    SJ.sound.init();
    SJ.shortcuts.push({ handlers: { help: () => V.common.showShortcuts(), f: () => SJ.utils.toggleFullscreen() } });
    window.addEventListener('unhandledrejection', (e) => {
      console.error(e.reason);
      SJ.ui.toast(SJ.errorMessage(e.reason), 'error');
    });
    registerPWA();
    requestPersistence();
    registerRoutes();

    // تحديث الصفحة أثناء مباراة: سؤال الاستكمال أو البدء من جديد
    const path = SJ.router.currentPath();
    const isAdminArea = path.startsWith('/admin') || path === '/login' || path === '/play';
    const active = await SJ.repo.Matches.getActive();
    if (active && !isAdminArea) {
      root.replaceChildren();
      const choice = await V.common.promptResume(active);
      location.replace(choice === 'resume' ? '#/game' : '#/play');
    }
    SJ.router.start(root);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.SJ);
