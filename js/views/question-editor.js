/* نافذة إضافة/تعديل سؤال مع معاينة فورية لشكله على الشاشة الكبيرة.
   النقاط تُحدَّد تلقائيًا حسب الخانة ولا يغيّرها الأدمن */
(function (SJ) {
  'use strict';

  const { h, icon } = SJ.dom;
  const { utils } = SJ;
  const C = SJ.views.common;
  const L = SJ.validate.LIMITS;

  /* points: مستوى السؤال في بنك الفئة (200 | 400 | 600). question: السؤال الحالي أو null.
     onSave(question) يستقبل مسودة السؤال. onImage(id, blob) لتسجيل الصور الجديدة في مسودة الفئة */
  function openQuestionEditor({ points: initialPoints, question, categoryName, categoryColor, onSave, onDelete, onImage }) {
    let points = question ? question.points : initialPoints;
    const draft = {
      id: question ? question.id || null : null,
      points,
      text: question ? question.text : '',
      answer: question ? question.answer : '',
      notes: question ? question.notes || '' : '',
      image: question ? question.image || null : null,
      answerImage: question ? question.answerImage || null : null,
    };
    const initial = JSON.stringify(draft);

    const textInput = h('textarea', { class: 'textarea', rows: 4, maxLength: L.questionText[1], placeholder: 'مثال: ما عاصمة اليابان؟', value: draft.text });
    const answerInput = h('input', { class: 'input', maxLength: L.answer[1], placeholder: 'مثال: طوكيو', value: draft.answer });
    const notesInput = h('textarea', { class: 'textarea', rows: 2, maxLength: L.notes[1], placeholder: 'تلميح، مصدر، أو إجابات مقبولة أخرى (تظهر للمقدم فقط)', value: draft.notes });
    const textField = C.field({ label: 'نص السؤال', input: textInput, required: true, counterMax: L.questionText[1] });
    const answerField = C.field({ label: 'الإجابة الصحيحة', input: answerInput, required: true, counterMax: L.answer[1] });
    const notesField = C.field({ label: 'ملاحظات للمقدم (اختياري)', input: notesInput, counterMax: L.notes[1] });

    const imagePicker = SJ.ui.imagePicker({
      value: draft.image,
      fit: 'contain',
      emptyText: 'صورة السؤال (اختيارية)',
      label: 'صورة السؤال',
      onChange: (id, blob) => {
        draft.image = id;
        if (id && onImage) onImage(id, blob);
        refreshPreview();
      },
    });
    const answerImagePicker = SJ.ui.imagePicker({
      value: draft.answerImage,
      fit: 'contain',
      emptyText: 'صورة الإجابة (اختيارية)',
      label: 'صورة الإجابة',
      onChange: (id, blob) => {
        draft.answerImage = id;
        if (id && onImage) onImage(id, blob);
        refreshPreview();
      },
    });

    // المعاينة الفورية
    const frame = h('div', { class: 'stage-frame theme-stage', 'aria-label': 'معاينة السؤال على الشاشة الكبيرة' });
    let showAnswer = false;
    const answerToggle = C.switchToggle({ label: 'إظهار الإجابة في المعاينة', checked: false, onChange: (v) => { showAnswer = v; refreshPreview(); } });
    function refreshPreview() {
      const stage = SJ.ui.stage.build({
        categoryName: categoryName || 'الفئة',
        categoryColor,
        points,
        text: utils.normalizeMultiline(textInput.value),
        imageId: draft.image,
        answer: utils.normalizeMultiline(answerInput.value),
        answerImageId: draft.answerImage,
        revealed: showAnswer,
      });
      frame.replaceChildren(stage.el);
    }
    const refreshSoon = utils.debounce(refreshPreview, 120);
    [textInput, answerInput].forEach((i) => i.addEventListener('input', refreshSoon));

    // مستوى السؤال: يحدد قيمة البطاقة التي قد يظهر فيها السؤال
    const levelControl = C.segmented({
      label: 'مستوى السؤال',
      value: points,
      options: SJ.engine.LEVELS.map((p) => ({ value: p, label: `${utils.formatNumber(p)} نقطة` })),
      onChange: (p) => {
        points = p;
        draft.points = p;
        refreshPreview();
      },
    });

    const body = h('div', { class: 'qeditor' },
      h('div', { class: 'qeditor__form' },
        h('div', { class: 'field' },
          h('span', { class: 'field__label' }, 'مستوى السؤال (قيمة النقاط)'),
          levelControl.el,
          h('span', { class: 'field__hint' }, 'سؤال 200 للأسهل و600 للأصعب. في كل مباراة يُسحب سؤالان عشوائيًا من كل مستوى.')),
        textField.el,
        answerField.el,
        h('div', { class: 'qeditor__images' },
          h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'صورة السؤال'), imagePicker.el),
          h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'صورة الإجابة'), answerImagePicker.el)),
        notesField.el),
      h('div', { class: 'qeditor__preview' },
        h('div', { class: 'qeditor__preview-head' }, h('span', null, 'المعاينة كما ستظهر على الشاشة الكبيرة'), answerToggle.el),
        frame));

    function collect() {
      draft.text = textInput.value;
      draft.answer = answerInput.value;
      draft.notes = notesInput.value;
      return draft;
    }

    function validate() {
      const errors = SJ.validate.question(Object.assign({}, collect(), {
        text: utils.normalizeMultiline(draft.text),
        answer: utils.normalizeMultiline(draft.answer),
        notes: utils.normalizeMultiline(draft.notes),
      }));
      textField.setError(errors.text);
      answerField.setError(errors.answer);
      notesField.setError(errors.notes);
      return !SJ.validate.hasErrors(errors);
    }

    const actions = [
      {
        label: question ? 'حفظ التعديلات' : 'إضافة السؤال',
        variant: 'primary',
        icon: 'check',
        value: 'saved',
        onClick: () => {
          if (!validate()) {
            SJ.ui.toast('راجع الحقول المطلوبة.', 'error');
            return false;
          }
          onSave({
            id: draft.id,
            points,
            text: utils.normalizeMultiline(draft.text),
            answer: utils.normalizeMultiline(draft.answer),
            notes: utils.normalizeMultiline(draft.notes),
            image: draft.image,
            answerImage: draft.answerImage,
          });
          return true;
        },
      },
      { label: 'إلغاء', variant: 'ghost', value: 'cancel' },
    ];
    if (question && onDelete) {
      actions.push({
        label: 'حذف السؤال',
        variant: 'danger',
        icon: 'trash',
        value: 'deleted',
        onClick: async () => {
          const ok = await SJ.ui.confirm({ title: 'حذف السؤال؟', message: 'سيُحذف هذا السؤال من مسودة الفئة. يُطبَّق الحذف عند حفظ الفئة.', confirmLabel: 'حذف', danger: true, icon: 'trash' });
          if (!ok) return false;
          onDelete();
          return true;
        },
      });
    }

    const modal = SJ.ui.modal({
      title: question ? 'تعديل سؤال' : `إضافة سؤال ${utils.formatNumber(points)} نقطة`,
      body,
      size: 'xl',
      actions,
      initialFocus: textInput,
    });
    // تأكيد قبل إغلاق النافذة إن وُجدت تغييرات غير محفوظة
    const originalClose = modal.close;
    modal.close = async (result) => {
      if ((result === null || result === 'cancel') && JSON.stringify(collect()) !== initial) {
        const ok = await SJ.ui.confirm({ title: 'تجاهل التغييرات؟', message: 'لم تحفظ هذا السؤال بعد. هل تريد إغلاق النافذة وتجاهل التغييرات؟', confirmLabel: 'تجاهل', cancelLabel: 'متابعة التحرير', danger: true });
        if (!ok) return;
      }
      originalClose(result);
    };
    refreshPreview();
    return modal;
  }

  SJ.views.openQuestionEditor = openQuestionEditor;
})(window.SJ);
