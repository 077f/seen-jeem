/* اختصارات لوحة المفاتيح بطبقات: الطبقة العليا (نافذة أو شاشة سؤال) تأخذ الأولوية.
   تعتمد على e.code حتى تعمل مع لوحة المفاتيح العربية أيضًا (مثلًا P = ح) */
(function (SJ) {
  'use strict';

  const layers = [];

  const CODE_MAP = {
    Space: 'space',
    Escape: 'esc',
    Digit0: '0', Numpad0: '0',
    Digit1: '1', Numpad1: '1',
    Digit2: '2', Numpad2: '2',
    KeyP: 'p',
    KeyF: 'f',
    KeyR: 'r',
    KeyM: 'm',
  };

  // قائمة الاختصارات المعروضة للمقدم
  const HELP = [
    { keys: ['Space'], desc: 'إظهار الإجابة' },
    { keys: ['1', '2'], desc: 'منح النقاط للفريق الأول / الثاني — أو «صح» / «خطأ» في الوضع الفردي' },
    { keys: ['0'], desc: 'لم يُجب أحد' },
    { keys: ['P'], desc: 'إيقاف المؤقت أو استئنافه' },
    { keys: ['R'], desc: 'إعادة المؤقت من البداية' },
    { keys: ['Esc'], desc: 'إغلاق السؤال دون احتساب' },
    { keys: ['F'], desc: 'ملء الشاشة' },
    { keys: ['M'], desc: 'كتم الصوت أو تشغيله' },
    { keys: ['Ctrl', 'Z'], desc: 'التراجع عن آخر احتساب أو تعديل' },
    { keys: ['?'], desc: 'عرض هذه القائمة' },
  ];

  function keyId(e) {
    if (e.key === '?' || e.key === '؟' || (e.code === 'Slash' && e.shiftKey)) return 'help';
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyZ' && !e.shiftKey) return 'undo';
    if (e.ctrlKey || e.metaKey || e.altKey) return null;
    return CODE_MAP[e.code] || null;
  }

  function isEditable(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
    if (target.tagName === 'INPUT') {
      return !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file'].includes(target.type);
    }
    return false;
  }

  document.addEventListener('keydown', (e) => {
    const id = keyId(e);
    if (!id) return;
    const editing = isEditable(e.target);
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      const fn = layer.handlers[id];
      const allowed = !editing || (layer.allowInInputs || []).includes(id);
      if (fn && allowed) {
        e.preventDefault();
        if (e.repeat) return;
        fn(e);
        return;
      }
      // الطبقة الحصرية تمنع وصول المفتاح لما تحتها (عدا قائمة المساعدة)
      if (layer.exclusive && id !== 'help') return;
    }
  });

  // إضافة طبقة اختصارات، ويعيد دالة لإزالتها
  function push(layer) {
    const entry = { handlers: layer.handlers || {}, exclusive: !!layer.exclusive, allowInInputs: layer.allowInInputs || [] };
    layers.push(entry);
    return () => {
      const i = layers.indexOf(entry);
      if (i >= 0) layers.splice(i, 1);
    };
  }

  SJ.shortcuts = { push, HELP };
})(window.SJ);
