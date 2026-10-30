/* الصفحة الرئيسية */
(function (SJ) {
  'use strict';

  const { h, icon } = SJ.dom;
  const C = SJ.views.common;

  function logo() {
    return h('div', { class: 'logo' },
      h('div', { class: 'logo__emblem', 'aria-hidden': 'true' }, 'س ج'),
      h('h1', { class: 'logo__title' }, 'سين جيم'),
      h('p', { class: 'logo__tag' }, 'مسابقة ثقافية للفعاليات والمدارس والتجمعات العائلية'));
  }

  // علامات استفهام وتعجب زخرفية في الخلفية
  function decoration() {
    const glyphs = [['؟', 8, 12, 9], ['!', 85, 18, 7], ['؟', 78, 70, 12], ['!', 14, 78, 10], ['؟', 50, 88, 6], ['!', 92, 45, 5]];
    return h('div', { class: 'home__deco', 'aria-hidden': 'true' }, glyphs.map(([g, x, y, size], i) => h('span', {
      style: { left: `${x}%`, top: `${y}%`, fontSize: `${size}rem`, animationDelay: `${i * -1.4}s` },
    }, g)));
  }

  SJ.views.home = {
    title: 'الرئيسية',
    async render(container) {
      container.classList.add('theme-stage');
      const active = await SJ.repo.Matches.getActive();
      const adminPath = SJ.auth.isLoggedIn({ touch: false }) ? '/admin' : '/login';
      container.append(h('div', { class: 'home' },
        decoration(),
        h('div', { class: 'home__inner' },
          logo(),
          h('div', { class: 'home__actions' },
            C.linkButton('ابدأ اللعب', '/play', 'primary', 'play', 'xl'),
            C.linkButton('لوحة الأدمن', adminPath, 'secondary', 'settings', 'xl')),
          active ? h('div', { class: 'home__resume' },
            icon('clock'),
            h('span', null, `مباراة جارية: ${C.playersLabel(active)}`),
            C.linkButton('استكمال المباراة', '/game', 'primary', 'play', 'sm')) : null,
          h('p', { class: 'home__hint' }, 'اضغط ', h('kbd', { class: 'kbd' }, '?'), ' في أي وقت لعرض اختصارات لوحة المفاتيح'))));
    },
  };
})(window.SJ);
