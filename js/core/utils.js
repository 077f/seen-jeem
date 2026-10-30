/* أدوات عامة: المعرّفات، تنسيق الأرقام والنصوص، التعامل مع الملفات، ملء الشاشة */
(function (SJ) {
  'use strict';

  // التشكيل والتطويل، تُحذف عند مقارنة الأسماء
  const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

  const utils = {
    uid(prefix = '') {
      const rand = new Uint32Array(2);
      crypto.getRandomValues(rand);
      return prefix + Date.now().toString(36) + rand[0].toString(36) + rand[1].toString(36).slice(0, 4);
    },

    // رمز مباراة من 6 أحرف واضحة (بدون O و0 و I و1 لتجنّب الالتباس)
    matchCode() {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const values = new Uint32Array(6);
      crypto.getRandomValues(values);
      return Array.from(values, (n) => chars[n % chars.length]).join('');
    },

    // توحيد المسافات في نص من سطر واحد
    normalize(value) {
      return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    },

    // توحيد نص متعدد الأسطر مع الحفاظ على فواصل الأسطر
    normalizeMultiline(value) {
      return String(value == null ? '' : value)
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/ ?\n ?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    },

    // مفتاح مقارنة الأسماء: بلا تشكيل، مع توحيد الألف والياء والتاء المربوطة وحالة الأحرف
    nameKey(value) {
      return utils.normalize(value)
        .replace(TASHKEEL, '')
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .toLowerCase();
    },

    countChars(value) {
      return Array.from(String(value == null ? '' : value)).length;
    },

    formatNumber(n) {
      return Number(n || 0).toLocaleString('en-US');
    },

    formatSigned(n) {
      const sign = n > 0 ? '+' : n < 0 ? '−' : '';
      return sign + utils.formatNumber(Math.abs(n));
    },

    formatDuration(ms) {
      if (ms == null || Number.isNaN(ms)) return '—';
      const s = ms / 1000;
      if (s < 60) return `${s.toFixed(1)} ث`;
      return `${Math.floor(s / 60)} د ${Math.round(s % 60)} ث`;
    },

    formatDateTime(ts) {
      if (!ts) return '—';
      try {
        return new Date(ts).toLocaleString('ar-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' });
      } catch (e) {
        return new Date(ts).toLocaleString('en-GB');
      }
    },

    formatBytes(bytes) {
      if (!bytes) return '0 ك.ب';
      if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} ك.ب`;
      return `${(bytes / 1048576).toFixed(1)} م.ب`;
    },

    // صياغة العدد مع المعدود بالعربية: سؤال واحد، سؤالان، 3 أسئلة، 11 سؤالًا
    countLabel(n, forms) {
      if (n === 0) return forms.zero || `0 ${forms.many}`;
      if (n === 1) return forms.one;
      if (n === 2) return forms.two;
      if (n >= 3 && n <= 10) return `${n} ${forms.few}`;
      return `${n} ${forms.many}`;
    },

    clamp(v, min, max) {
      return Math.min(max, Math.max(min, v));
    },

    debounce(fn, wait = 150) {
      let t = null;
      return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
      };
    },

    clone(value) {
      return JSON.parse(JSON.stringify(value));
    },

    randomItem(list) {
      if (!list.length) return null;
      const r = new Uint32Array(1);
      crypto.getRandomValues(r);
      return list[r[0] % list.length];
    },

    prefersReducedMotion() {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    },

    downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    },

    blobToDataURL(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    },

    dataURLToBlob(dataUrl) {
      const comma = dataUrl.indexOf(',');
      const header = dataUrl.slice(0, comma);
      const m = /^data:([a-z0-9.+/-]+)(;base64)?$/i.exec(header);
      if (comma < 0 || !m) throw new SJ.AppError('IMPORT_INVALID', 'صورة غير صالحة داخل الملف.');
      const payload = dataUrl.slice(comma + 1);
      const bin = m[2] ? atob(payload) : decodeURIComponent(payload);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: m[1].toLowerCase() });
    },

    todayStamp() {
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    },

    isFullscreen() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement);
    },

    async toggleFullscreen() {
      try {
        if (utils.isFullscreen()) {
          const exit = document.exitFullscreen || document.webkitExitFullscreen;
          await exit.call(document);
        } else {
          const el = document.documentElement;
          const req = el.requestFullscreen || el.webkitRequestFullscreen;
          if (!req) throw new Error('unsupported');
          await req.call(el);
        }
      } catch (e) {
        if (SJ.ui.toast) SJ.ui.toast('تعذّر تفعيل ملء الشاشة في هذا المتصفح. جرّب مفتاح F11.', 'warning');
      }
    },
  };

  SJ.utils = utils;
})(window.SJ);
