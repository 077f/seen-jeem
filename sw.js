/* Service Worker: يخزّن ملفات التطبيق ليعمل بلا إنترنت بعد أول تحميل (عند التشغيل من خادم) */
const CACHE = 'seen-jeem-v1.1.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icon.svg',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './css/admin.css',
  './css/play.css',
  './css/game.css',
  './js/core/ns.js',
  './js/core/utils.js',
  './js/core/validation.js',
  './js/core/router.js',
  './js/game/engine.js',
  './js/data/db.js',
  './js/data/images.js',
  './js/data/repo.js',
  './js/data/auth.js',
  './js/data/transfer.js',
  './js/data/seed.js',
  './js/ui/dom.js',
  './js/ui/shortcuts.js',
  './js/ui/dialogs.js',
  './js/ui/sound.js',
  './js/ui/effects.js',
  './js/ui/image-tools.js',
  './js/ui/game-parts.js',
  './js/views/common.js',
  './js/views/home.js',
  './js/views/login.js',
  './js/views/admin-dashboard.js',
  './js/views/question-editor.js',
  './js/views/category-editor.js',
  './js/views/category-preview.js',
  './js/views/settings.js',
  './js/views/match-setup.js',
  './js/views/question-screen.js',
  './js/views/game-board.js',
  './js/views/results.js',
  './js/app.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// ملفات التطبيق: من الذاكرة أولًا. الخطوط: من الشبكة مع حفظ نسخة للعمل دون اتصال
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !isFont) return;
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response && (response.ok || response.type === 'opaque')) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    }),
  );
});
