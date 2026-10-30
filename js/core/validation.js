/* قواعد التحقق من المدخلات، مشتركة بين الواجهة وطبقة البيانات */
(function (SJ) {
  'use strict';

  const { utils, config } = SJ;

  const LIMITS = Object.freeze({
    categoryName: [2, 40],
    categoryDescription: [0, 200],
    questionText: [5, 500],
    answer: [1, 200],
    notes: [0, 300],
    playerName: [1, config.PLAYER_NAME_MAX],
    reason: [0, 60],
  });

  function checkLength(value, range, label) {
    const [min, max] = range;
    const n = utils.countChars(value);
    if (n === 0 && min > 0) return `${label} مطلوب.`;
    if (n < min) return `${label} يجب أن يتكوّن من ${min} أحرف على الأقل.`;
    if (n > max) return `${label} يجب ألا يتجاوز ${max} حرفًا.`;
    return null;
  }

  const isHexColor = (v) => /^#[0-9a-fA-F]{6}$/.test(String(v || ''));

  // التحقق من الفئة، otherNames: أسماء الفئات الأخرى لضمان عدم التكرار
  function category(data, otherNames = []) {
    const errors = {};
    const name = utils.normalize(data.name);
    const nameError = checkLength(name, LIMITS.categoryName, 'اسم الفئة');
    if (nameError) errors.name = nameError;
    else if (otherNames.some((n) => utils.nameKey(n) === utils.nameKey(name))) {
      errors.name = 'يوجد فئة أخرى بهذا الاسم. اختر اسمًا مختلفًا.';
    }
    const descError = checkLength(utils.normalizeMultiline(data.description), LIMITS.categoryDescription, 'الوصف');
    if (descError) errors.description = descError;
    if (data.color && !isHexColor(data.color)) errors.color = 'لون الفئة غير صالح.';
    return errors;
  }

  function question(data) {
    const errors = {};
    const t = checkLength(utils.normalizeMultiline(data.text), LIMITS.questionText, 'نص السؤال');
    if (t) errors.text = t;
    const a = checkLength(utils.normalizeMultiline(data.answer), LIMITS.answer, 'الإجابة');
    if (a) errors.answer = a;
    const n = checkLength(utils.normalizeMultiline(data.notes), LIMITS.notes, 'ملاحظات المقدم');
    if (n) errors.notes = n;
    if (![200, 400, 600].includes(data.points)) errors.points = 'قيمة نقاط السؤال غير صالحة (200 أو 400 أو 600).';
    return errors;
  }

  // التحقق من المتسابقين: يعيد مصفوفة أخطاء بنفس ترتيب القائمة
  function players(list, mode) {
    const label = mode === 'single' ? 'اسم المتسابق' : 'اسم الفريق';
    const errors = list.map(() => ({}));
    list.forEach((p, i) => {
      const e = checkLength(utils.normalize(p.name), LIMITS.playerName, label);
      if (e) errors[i].name = e;
      if (!isHexColor(p.color)) errors[i].color = 'اختر لونًا.';
    });
    if (mode === 'teams' && list.length === 2) {
      if (!errors[0].name && !errors[1].name && utils.nameKey(list[0].name) === utils.nameKey(list[1].name)) {
        errors[1].name = 'اسما الفريقين متطابقان. اختر اسمًا مختلفًا لكل فريق.';
      }
      if (!errors[1].color && String(list[0].color).toLowerCase() === String(list[1].color).toLowerCase()) {
        errors[1].color = 'اختر لونًا مختلفًا عن لون الفريق الأول.';
      }
    }
    return errors;
  }

  function hasErrors(e) {
    if (Array.isArray(e)) return e.some(hasErrors);
    return !!e && Object.keys(e).length > 0;
  }

  function firstError(e) {
    if (Array.isArray(e)) {
      for (const item of e) {
        const f = firstError(item);
        if (f) return f;
      }
      return null;
    }
    const keys = Object.keys(e || {});
    return keys.length ? e[keys[0]] : null;
  }

  SJ.validate = { LIMITS, checkLength, isHexColor, category, question, players, hasErrors, firstError };
})(window.SJ);
