/* مساحة الأسماء العامة «SJ»: الثوابت، الأخطاء الموحّدة برسائل عربية، ناقل الأحداث */
(function (root) {
  'use strict';

  const SJ = (root.SJ = root.SJ || {});
  SJ.version = '1.1.0';

  // ثوابت التطبيق العامة
  SJ.config = Object.freeze({
    MAX_CATEGORIES_PER_MATCH: 3,
    PLAYER_NAME_MAX: 20,
    IMAGE_TYPES: Object.freeze(['image/jpeg', 'image/png', 'image/webp']),
    IMAGE_MAX_BYTES: 1024 * 1024,
    IMAGE_INPUT_MAX_BYTES: 25 * 1024 * 1024,
    CATEGORY_IMAGE_ASPECT: 4 / 3,
    TIMER_OPTIONS: Object.freeze([0, 15, 30, 45, 60]),
    SESSION_TTL_MS: 2 * 60 * 60 * 1000,
    LOGIN_MAX_ATTEMPTS: 5,
    LOGIN_LOCK_MS: 5 * 60 * 1000,
    SINGLE_PLAYER_COLOR: '#f5c542',
    TEAM_COLORS: Object.freeze(['#3b82f6', '#f97316', '#10b981', '#a855f7', '#ec4899', '#eab308', '#06b6d4', '#ef4444']),
    DEFAULT_TEAM_COLORS: Object.freeze(['#3b82f6', '#f97316']),
    CATEGORY_COLORS: Object.freeze(['#f5c542', '#10b981', '#3b82f6', '#a855f7', '#ec4899', '#f97316', '#06b6d4', '#84cc16']),
  });

  // رسائل الأخطاء المفهومة للمستخدم
  const MESSAGES = Object.freeze({
    UNKNOWN: 'حدث خطأ غير متوقع. حاول مرة أخرى.',
    DB: 'تعذّر الوصول إلى التخزين المحلي في المتصفح.',
    NO_STORAGE: 'هذا المتصفح لا يدعم التخزين المحلي (IndexedDB) أو أنه معطّل. استخدم Chrome أو Edge أو Firefox حديثًا، وتجنّب وضع التصفح الخاص.',
    STORAGE_FULL: 'مساحة التخزين في المتصفح ممتلئة. صدّر المحتوى من الإعدادات ثم احذف بعض الفئات أو الصور.',
    NOT_FOUND: 'العنصر المطلوب غير موجود، ربما حُذف.',
    VALIDATION: 'بعض الحقول غير صحيحة. راجع الرسائل الظاهرة.',
    NAME_TAKEN: 'يوجد فئة أخرى بهذا الاسم.',
    CATEGORY_IN_USE: 'هذه الفئة مستخدمة في مباراة جارية، ولا يمكن تعديلها أو حذفها حتى تنتهي المباراة.',
    CATEGORY_FULL: 'وصلت الفئة إلى الحد الأقصى (50 سؤالًا لكل مستوى نقاط).',
    SLOT_TAKEN: 'هذه الخانة تحتوي على سؤال بالفعل.',
    BAD_CREDENTIALS: 'بيانات الدخول غير صحيحة.',
    LOCKED: 'تم إيقاف تسجيل الدخول مؤقتًا بسبب كثرة المحاولات الفاشلة.',
    WRONG_PASSWORD: 'كلمة المرور الحالية غير صحيحة.',
    IMAGE_TYPE: 'صيغة الصورة غير مدعومة. الصيغ المسموحة: JPG وPNG وWEBP فقط.',
    IMAGE_TOO_LARGE: 'حجم الصورة كبير جدًا (أكثر من 25 ميجا). اختر صورة أصغر.',
    IMAGE_DECODE: 'تعذّرت قراءة الصورة، ربما الملف تالف.',
    IMPORT_INVALID: 'الملف غير صالح للاستيراد.',
    IMPORT_BLOCKED: 'لا يمكن الاستيراد أثناء وجود مباراة جارية. أنهِ المباراة أولًا.',
    MATCH_NOT_FOUND: 'لا توجد مباراة جارية.',
    MATCH_ACTIVE: 'توجد مباراة جارية بالفعل. أكملها أو أنهِها أولًا.',
  });

  class AppError extends Error {
    constructor(code, message, details) {
      super(message || MESSAGES[code] || MESSAGES.UNKNOWN);
      this.name = 'AppError';
      this.code = code;
      this.details = details;
    }
  }

  SJ.AppError = AppError;
  SJ.MESSAGES = MESSAGES;

  // تحويل أي خطأ إلى رسالة عربية مفهومة
  SJ.errorMessage = function (err) {
    if (!err) return MESSAGES.UNKNOWN;
    if (err.name === 'AppError' || err.name === 'EngineError') return err.message;
    if (err.name === 'QuotaExceededError') return MESSAGES.STORAGE_FULL;
    return MESSAGES.UNKNOWN;
  };

  // ناقل أحداث بسيط بين الوحدات
  const listeners = new Map();
  SJ.events = {
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      return () => listeners.get(name).delete(fn);
    },
    emit(name, payload) {
      (listeners.get(name) || []).forEach((fn) => {
        try { fn(payload); } catch (e) { console.error(e); }
      });
    },
  };

  // حالة مؤقتة في الذاكرة (لا تُحفظ)
  SJ.state = { settings: null, setupDraft: null, afterLogin: null };
  SJ.ui = SJ.ui || {};
  SJ.views = SJ.views || {};
})(window);
