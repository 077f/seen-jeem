/* إضافة/تعديل فئة: بيانات الفئة وصورتها ولونها، وبنك أسئلتها مجمّعًا حسب مستوى النقاط.
   كل التعديلات تبقى مسودة حتى الضغط على «حفظ»، مع تحذير عند المغادرة دون حفظ */
(function (SJ) {
  'use strict';

  const { h, icon } = SJ.dom;
  const { utils, config } = SJ;
  const { Categories } = SJ.repo;
  const C = SJ.views.common;
  const L = SJ.validate.LIMITS;

  SJ.views.categoryEditor = {
    title: 'تحرير فئة',
    async render(container, params) {
      const isNew = !params.id;
      let original = null;
      if (!isNew) {
        original = await Categories.get(params.id);
        if (!original) {
          const content = C.adminShell(container, { active: '/admin', title: 'الفئة غير موجودة', back: '/admin' });
          content.append(C.emptyState({ icon: 'warning', title: 'الفئة غير موجودة', text: 'ربما حُذفت.', actions: [C.linkButton('العودة للوحة التحكم', '/admin', 'primary', 'arrowRight')] }));
          return;
        }
      }
      const locked = !!(original && original.inUse);

      // المسودة
      const draft = {
        name: original ? original.name : '',
        description: original ? original.description || '' : '',
        color: original ? original.color || config.CATEGORY_COLORS[0] : config.CATEGORY_COLORS[0],
        image: original ? original.image : null,
        isActive: original ? !!original.isActive : true,
        // بنك الأسئلة: كل سؤال له مستوى نقاط (200/400/600)
        questions: original ? original.questions.map((q) => Object.assign({ key: q.id }, q)) : [],
      };
      const pendingImages = new Map();
      const snapshot = () => JSON.stringify(draft);
      let savedSnapshot = snapshot();
      const isDirty = () => !locked && snapshot() !== savedSnapshot;
      SJ.router.setLeaveGuard(isDirty);

      const content = C.adminShell(container, {
        active: '/admin',
        title: isNew ? 'إضافة فئة جديدة' : `تعديل: ${original.name}`,
        back: '/admin',
        actions: isNew ? [] : [C.linkButton('معاينة', `/admin/category/${original.id}/preview`, 'secondary', 'eye')],
      });

      if (locked) {
        content.append(C.banner({
          type: 'warning',
          icon: 'lock',
          text: 'هذه الفئة مستخدمة في مباراة جارية، لذلك لا يمكن تعديلها الآن. أنهِ المباراة أولًا.',
          actions: [C.linkButton('الذهاب للمباراة', '/game', 'secondary', 'play', 'sm')],
        }));
      }

      /* ---------- بيانات الفئة ---------- */
      const nameInput = h('input', { class: 'input', maxLength: L.categoryName[1], value: draft.name, placeholder: 'مثال: تاريخ إسلامي', disabled: locked });
      const descInput = h('textarea', { class: 'textarea', rows: 3, maxLength: L.categoryDescription[1], value: draft.description, placeholder: 'وصف قصير يظهر عند اختيار الفئات (اختياري)', disabled: locked });
      const nameField = C.field({ label: 'اسم الفئة', input: nameInput, required: true, counterMax: L.categoryName[1], hint: 'من حرفين إلى 40 حرفًا، ولا يتكرر مع فئة أخرى.' });
      const descField = C.field({ label: 'الوصف', input: descInput, counterMax: L.categoryDescription[1] });
      nameInput.addEventListener('input', () => { draft.name = nameInput.value; nameField.setError(''); updateStatus(); });
      descInput.addEventListener('input', () => { draft.description = descInput.value; updateStatus(); });

      const picker = SJ.ui.imagePicker({
        value: draft.image,
        aspect: config.CATEGORY_IMAGE_ASPECT,
        disabled: locked,
        label: 'صورة الفئة',
        onChange: (id, blob) => {
          draft.image = id;
          if (id) pendingImages.set(id, blob);
          updateStatus();
        },
      });
      const colorPicker = C.swatches({ colors: config.CATEGORY_COLORS, value: draft.color, label: 'لون الفئة', onChange: (c) => { draft.color = c; updateStatus(); } });
      const activeToggle = C.switchToggle({ label: 'مفعّلة (تظهر في اللعب عند اكتمالها)', checked: draft.isActive, disabled: locked, onChange: (v) => { draft.isActive = v; updateStatus(); } });

      /* ---------- بنك الأسئلة: قائمة لكل مستوى نقاط ---------- */
      const { LEVELS, MIN_PER_LEVEL, MAX_PER_LEVEL } = SJ.engine;
      const QUESTION_FORMS = { zero: 'لا أسئلة بعد', one: 'سؤال واحد', two: 'سؤالان', few: 'أسئلة', many: 'سؤالًا' };
      const levelsEl = h('div', { class: 'slot-groups' });
      const countEl = h('small', null);
      const searchInput = h('input', { class: 'input', type: 'search', placeholder: 'ابحث في نص الأسئلة أو الإجابات…', 'aria-label': 'البحث في الأسئلة' });
      const countOf = (p) => draft.questions.filter((q) => q.points === p).length;
      const shorten = (text, n) => (utils.countChars(text) > n ? Array.from(text).slice(0, n).join('') + '…' : text);

      function renderLevels() {
        const term = utils.nameKey(searchInput.value);
        levelsEl.replaceChildren(...LEVELS.map((points) => {
          const all = draft.questions.filter((q) => q.points === points);
          const shown = term ? all.filter((q) => utils.nameKey(`${q.text} ${q.answer}`).includes(term)) : all;
          const full = all.length >= MAX_PER_LEVEL;
          const addBtn = h('button', { type: 'button', class: 'slot slot--add', disabled: locked || full },
            h('span', { class: 'slot__head' }, `+ إضافة سؤال ${utils.formatNumber(points)}`),
            h('span', { class: 'slot__text' }, full ? `وصل المستوى للحد الأقصى (${MAX_PER_LEVEL} سؤالًا)` : 'اضغط لإضافة سؤال جديد لهذا المستوى'));
          addBtn.addEventListener('click', () => editQuestion(null, points));
          return h('details', { class: 'slot-group', open: true },
            h('summary', { class: 'slot-group__head' },
              h('span', { class: ['tier-chip', `tier-${points}`] }, utils.formatNumber(points)),
              h('span', null, utils.countLabel(all.length, QUESTION_FORMS)),
              all.length >= MIN_PER_LEVEL
                ? h('span', { class: 'badge badge--success' }, 'كافٍ ✓')
                : h('span', { class: 'badge badge--warning' }, `ينقص ${MIN_PER_LEVEL - all.length}`)),
            h('div', { class: 'slots' }, shown.map(questionCard), term ? null : addBtn),
            term && !shown.length ? h('p', { class: 'field__hint' }, 'لا نتائج في هذا المستوى.') : null);
        }));
        countEl.textContent = `${utils.countLabel(draft.questions.length, QUESTION_FORMS)} في البنك`;
      }
      searchInput.addEventListener('input', utils.debounce(renderLevels, 120));

      function questionCard(q) {
        const btn = h('button', { type: 'button', class: 'slot is-filled', disabled: locked },
          h('span', { class: 'slot__text slot__text--main' }, q.text),
          h('span', { class: 'slot__meta' },
            h('span', { class: 'badge badge--muted' }, `الإجابة: ${shorten(q.answer, 24)}`),
            q.image || q.answerImage ? h('span', { class: 'badge badge--muted' }, '🖼 صورة') : null,
            q.notes ? h('span', { class: 'badge badge--muted' }, '📝 ملاحظة') : null,
            q.id ? null : h('span', { class: 'badge badge--warning' }, 'غير محفوظ')));
        btn.addEventListener('click', () => editQuestion(q, q.points));
        return btn;
      }

      function editQuestion(question, points) {
        if (locked) return;
        SJ.views.openQuestionEditor({
          points,
          question,
          categoryName: utils.normalize(nameInput.value) || 'الفئة',
          categoryColor: draft.color,
          onImage: (id, blob) => pendingImages.set(id, blob),
          onSave: (q) => {
            const movingLevel = !question || question.points !== q.points;
            if (movingLevel && countOf(q.points) >= MAX_PER_LEVEL) {
              SJ.ui.toast(SJ.MESSAGES.CATEGORY_FULL, 'error');
              return;
            }
            if (question) Object.assign(question, q);
            else draft.questions.push(Object.assign({ key: utils.uid('k') }, q));
            renderLevels();
            updateStatus();
            SJ.ui.toast(question ? 'تم تعديل السؤال. لا تنسَ حفظ الفئة.' : 'تمت إضافة السؤال للبنك. لا تنسَ حفظ الفئة.', 'info');
          },
          onDelete: () => {
            draft.questions.splice(draft.questions.indexOf(question), 1);
            renderLevels();
            updateStatus();
          },
        });
      }

      /* ---------- الحفظ ---------- */
      const statusNote = h('span', { class: 'sticky-actions__note', 'aria-live': 'polite' });
      const saveBtn = h('button', { type: 'button', class: 'btn btn--primary', disabled: locked }, icon('check'), 'حفظ');
      const savePreviewBtn = h('button', { type: 'button', class: 'btn btn--secondary', disabled: locked }, icon('eye'), 'حفظ ومعاينة');
      saveBtn.addEventListener('click', () => save(false));
      savePreviewBtn.addEventListener('click', () => save(true));

      function updateStatus() {
        const dirty = isDirty();
        const missing = LEVELS
          .filter((p) => countOf(p) < MIN_PER_LEVEL)
          .map((p) => `${MIN_PER_LEVEL - countOf(p)} من مستوى ${p}`);
        if (!draft.image) missing.push('صورة');
        statusNote.classList.toggle('is-dirty', dirty);
        statusNote.textContent = (dirty ? 'تغييرات غير محفوظة • ' : '') + (missing.length ? `ينقص: ${missing.join('، ')}` : 'الفئة جاهزة للعب');
      }

      async function save(thenPreview) {
        draft.name = nameInput.value;
        draft.description = descInput.value;
        const errors = SJ.validate.category({ name: draft.name, description: draft.description, color: draft.color });
        nameField.setError(errors.name);
        descField.setError(errors.description);
        if (SJ.validate.hasErrors(errors)) {
          SJ.ui.toast(SJ.validate.firstError(errors), 'error');
          nameInput.focus();
          return;
        }
        saveBtn.disabled = true;
        savePreviewBtn.disabled = true;
        try {
          const id = await Categories.saveBundle({
            category: { id: original ? original.id : null, name: draft.name, description: draft.description, color: draft.color, image: draft.image, isActive: draft.isActive },
            questions: draft.questions.map(({ key, ...q }) => q),
            pendingImages,
          });
          savedSnapshot = snapshot();
          SJ.ui.toast('تم حفظ الفئة بنجاح.', 'success');
          if (thenPreview) SJ.router.go(`/admin/category/${id}/preview`);
          else if (isNew) SJ.router.go(`/admin/category/${id}`, { replace: true });
          else SJ.router.go(`/admin/category/${id}`);
        } catch (err) {
          if (err.code === 'VALIDATION' && err.details && err.details.name) nameField.setError(err.details.name);
          SJ.ui.toast(SJ.errorMessage(err), 'error', err.code === 'STORAGE_FULL'
            ? { action: { label: 'الإعدادات', onClick: () => SJ.router.go('/admin/settings') } }
            : undefined);
          saveBtn.disabled = false;
          savePreviewBtn.disabled = false;
        }
      }

      content.append(
        h('div', { class: 'editor-grid' },
          h('section', { class: 'panel', 'aria-labelledby': 'cat-info-title' },
            h('h2', { class: 'panel__title', id: 'cat-info-title' }, 'بيانات الفئة'),
            nameField.el,
            descField.el,
            h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'لون الفئة'), colorPicker.el),
            activeToggle.el),
          h('section', { class: 'panel', 'aria-labelledby': 'cat-img-title' },
            h('h2', { class: 'panel__title', id: 'cat-img-title' }, 'صورة الفئة', h('small', null, 'مطلوبة للنشر • تُقص بنسبة 4:3')),
            picker.el)),
        h('section', { class: 'panel', 'aria-labelledby': 'cat-q-title' },
          h('h2', { class: 'panel__title', id: 'cat-q-title' }, 'بنك الأسئلة', countEl),
          h('p', { class: 'muted' }, `أضف أي عدد من الأسئلة لكل مستوى (حتى ${MAX_PER_LEVEL}). في كل مباراة يُسحب سؤالان عشوائيًا من كل مستوى، مع تفضيل الأسئلة التي لم تُلعب مؤخرًا. تصبح الفئة جاهزة عندما يكون فيها سؤالان على الأقل من كل مستوى وصورة.`),
          searchInput,
          levelsEl),
        h('div', { class: 'sticky-actions' }, saveBtn, savePreviewBtn, C.linkButton('إلغاء', '/admin', 'ghost'), statusNote));

      renderLevels();
      updateStatus();
      if (isNew) setTimeout(() => nameInput.focus(), 60);
      if (locked) colorPicker.el.querySelectorAll('button, input').forEach((b) => { b.disabled = true; });
    },
  };
})(window.SJ);
