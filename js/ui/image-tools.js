/* أدوات الصور في الواجهة: نافذة القص بنسبة ثابتة، ومكوّن اختيار الصورة بالسحب والإفلات */
(function (SJ) {
  'use strict';

  const { h, icon } = SJ.dom;
  const { utils } = SJ;

  /* نافذة قص الصورة: سحب لتحديد الجزء الظاهر وتكبير بالشريط أو عجلة الفأرة.
     تعيد مستطيل القص بإحداثيات الصورة الأصلية أو null عند الإلغاء */
  function cropImage(source, { aspect = 4 / 3, title = 'قص الصورة' } = {}) {
    return new Promise((resolve) => {
      const { w: iw, h: ih } = SJ.images.dims(source);
      const vw = Math.max(240, Math.min(500, window.innerWidth - 72));
      const vh = Math.round(vw / aspect);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = h('canvas', {
        class: 'cropper__canvas',
        width: Math.round(vw * dpr),
        height: Math.round(vh * dpr),
        style: { width: `${vw}px`, height: `${vh}px` },
        'aria-label': 'منطقة القص، اسحب لتحريك الصورة',
      });
      const ctx = canvas.getContext('2d');
      const base = Math.max(vw / iw, vh / ih);
      let zoom = 1;
      let scale = base;
      let x = (vw - iw * base) / 2;
      let y = (vh - ih * base) / 2;
      let resolved = false;

      const clampPos = () => {
        x = Math.min(0, Math.max(vw - iw * scale, x));
        y = Math.min(0, Math.max(vh - ih * scale, y));
      };
      const draw = () => {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, vw, vh);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(source, x, y, iw * scale, ih * scale);
        // خطوط الأثلاث للمساعدة على التكوين
        ctx.strokeStyle = 'rgba(255,255,255,.35)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo((vw * i) / 3, 0);
          ctx.lineTo((vw * i) / 3, vh);
          ctx.moveTo(0, (vh * i) / 3);
          ctx.lineTo(vw, (vh * i) / 3);
          ctx.stroke();
        }
      };
      const range = h('input', { type: 'range', min: '1', max: '4', step: '0.01', value: '1', 'aria-label': 'التكبير' });
      const setZoom = (z, cx = vw / 2, cy = vh / 2) => {
        z = utils.clamp(z, 1, 4);
        const px = (cx - x) / scale;
        const py = (cy - y) / scale;
        zoom = z;
        scale = base * z;
        x = cx - px * scale;
        y = cy - py * scale;
        clampPos();
        draw();
        range.value = String(z);
      };
      range.addEventListener('input', () => setZoom(Number(range.value)));

      let drag = null;
      canvas.addEventListener('pointerdown', (e) => {
        canvas.setPointerCapture(e.pointerId);
        drag = { px: e.clientX, py: e.clientY, x, y };
        canvas.classList.add('is-dragging');
      });
      canvas.addEventListener('pointermove', (e) => {
        if (!drag) return;
        x = drag.x + (e.clientX - drag.px);
        y = drag.y + (e.clientY - drag.py);
        clampPos();
        draw();
      });
      const endDrag = () => {
        drag = null;
        canvas.classList.remove('is-dragging');
      };
      canvas.addEventListener('pointerup', endDrag);
      canvas.addEventListener('pointercancel', endDrag);
      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        setZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), e.clientX - rect.left, e.clientY - rect.top);
      }, { passive: false });

      const body = h('div', { class: 'cropper' },
        h('p', { class: 'muted' }, 'اسحب الصورة لاختيار الجزء الظاهر، واستخدم شريط التكبير أو عجلة الفأرة.'),
        h('div', { class: 'cropper__viewport' }, canvas),
        h('div', { class: 'cropper__zoom' }, icon('minus'), range, icon('plus')));

      SJ.ui.modal({
        title,
        body,
        size: 'md',
        actions: [
          {
            label: 'اعتماد القص',
            variant: 'primary',
            icon: 'check',
            onClick: () => {
              resolved = true;
              resolve({ sx: -x / scale, sy: -y / scale, sw: vw / scale, sh: vh / scale });
            },
          },
          { label: 'إلغاء', variant: 'ghost' },
        ],
        onClose: () => { if (!resolved) resolve(null); },
      });
      draw();
    });
  }

  /* مكوّن اختيار صورة: سحب وإفلات أو اختيار ملف، ضغط تلقائي، معاينة فورية، قص اختياري.
     onChange(id, blob) يُستدعى بمعرّف صورة جديد لم يُحفظ بعد، أو (null) عند الإزالة */
  function imagePicker({ value = null, aspect = null, onChange, emptyText = 'اسحب صورة هنا أو اضغط للاختيار', fit = 'cover', disabled = false, label = 'اختيار صورة' }) {
    let current = value;
    let busy = false;
    let isDisabled = disabled;

    const input = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 'sr-only', tabIndex: -1, 'aria-hidden': 'true' });
    const img = h('img', { class: 'dropzone__preview', alt: '', hidden: true, style: { objectFit: fit } });
    const placeholder = h('div', { class: 'dropzone__empty' },
      icon('upload'),
      h('strong', null, emptyText),
      h('span', { class: 'field__hint' }, 'JPG أو PNG أو WEBP — تُضغط تلقائيًا إلى أقل من 1 ميجا'));
    const spinner = h('div', { class: 'dropzone__busy', hidden: true }, h('span', { class: 'spinner' }), h('span', null, 'جارٍ معالجة الصورة…'));
    const changeBtn = h('button', { type: 'button', class: 'btn btn--secondary btn--sm', onclick: (e) => { e.stopPropagation(); choose(); } }, icon('image'), 'تغيير');
    const removeBtn = h('button', {
      type: 'button',
      class: 'btn btn--ghost btn--sm',
      onclick: (e) => {
        e.stopPropagation();
        set(null);
        if (onChange) onChange(null, null);
      },
    }, icon('trash'), 'إزالة');
    const tools = h('div', { class: 'dropzone__tools', hidden: true }, changeBtn, removeBtn);
    const errorEl = h('div', { class: 'field__error', role: 'alert' });
    const zone = h('div', {
      class: ['dropzone', aspect && 'dropzone--aspect'],
      role: 'button',
      tabIndex: 0,
      'aria-label': label,
      style: aspect ? { aspectRatio: String(aspect) } : null,
    }, img, placeholder, tools, spinner);

    zone.addEventListener('click', () => { if (!current) choose(); });
    zone.addEventListener('keydown', (e) => {
      if (e.target !== zone) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        choose();
      }
    });
    ['dragenter', 'dragover'].forEach((t) => zone.addEventListener(t, (e) => {
      e.preventDefault();
      if (!isDisabled) zone.classList.add('is-over');
    }));
    ['dragleave', 'drop'].forEach((t) => zone.addEventListener(t, (e) => {
      e.preventDefault();
      zone.classList.remove('is-over');
    }));
    zone.addEventListener('drop', (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handle(file);
    });
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.value = '';
      if (file) handle(file);
    });

    function choose() {
      if (busy || isDisabled) return;
      input.click();
    }

    async function handle(file) {
      if (busy || isDisabled) return;
      errorEl.textContent = '';
      let source = null;
      try {
        SJ.images.validateFile(file);
        busy = true;
        spinner.hidden = false;
        source = await SJ.images.decode(file);
        let crop = null;
        if (aspect) {
          spinner.hidden = true;
          crop = await cropImage(source, { aspect });
          if (!crop) return;
          spinner.hidden = false;
        }
        const blob = await SJ.images.compress(source, aspect ? { crop, maxWidth: 1200, maxHeight: 900 } : { maxWidth: 1600, maxHeight: 1600 });
        const id = utils.uid('img');
        SJ.images.registerPending(id, blob);
        set(id);
        if (onChange) onChange(id, blob);
      } catch (err) {
        const msg = SJ.errorMessage(err);
        errorEl.textContent = msg;
        SJ.ui.toast(msg, 'error');
      } finally {
        busy = false;
        spinner.hidden = true;
        if (source && source.close) source.close();
      }
    }

    function set(id) {
      current = id;
      const has = !!id;
      placeholder.hidden = has;
      tools.hidden = !has;
      zone.classList.toggle('has-image', has);
      if (has) SJ.images.attach(img, id);
      else {
        img.hidden = true;
        img.removeAttribute('src');
      }
    }

    function setDisabled(d) {
      isDisabled = d;
      zone.classList.toggle('is-disabled', d);
      changeBtn.disabled = d;
      removeBtn.disabled = d;
      zone.tabIndex = d ? -1 : 0;
    }

    set(current);
    setDisabled(disabled);
    const el = h('div', { class: 'imagepicker' }, zone, input, errorEl);
    return { el, set, get: () => current, setDisabled, setError: (msg) => { errorEl.textContent = msg || ''; } };
  }

  Object.assign(SJ.ui, { cropImage, imagePicker });
})(window.SJ);
