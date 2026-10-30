/* معالجة الصور: التحقق من النوع، الفك، القص، الضغط إلى أقل من 1 ميجا، وروابط العرض */
(function (SJ) {
  'use strict';

  const { config, AppError } = SJ;
  // ذاكرة روابط العرض: معرّف الصورة ← Promise<رابط blob أو null>
  const cache = new Map();

  function validateFile(file) {
    if (!file) throw new AppError('IMAGE_DECODE');
    const type = String(file.type || '').toLowerCase();
    const extOk = /\.(jpe?g|png|webp)$/i.test(file.name || '');
    if (!config.IMAGE_TYPES.includes(type) && !(type === '' && extOk)) throw new AppError('IMAGE_TYPE');
    if (file.size > config.IMAGE_INPUT_MAX_BYTES) throw new AppError('IMAGE_TOO_LARGE');
  }

  async function decode(blob) {
    if (window.createImageBitmap) {
      try {
        return await createImageBitmap(blob);
      } catch (e) { /* نجرب الطريقة التقليدية */ }
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        resolve(img);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new AppError('IMAGE_DECODE'));
      };
      img.src = url;
    });
  }

  const dims = (src) => ({ w: src.naturalWidth || src.width, h: src.naturalHeight || src.height });

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
  }

  /* ضغط الصورة مع قص اختياري، ثم خفض الجودة والأبعاد تدريجيًا حتى الحد الأقصى للحجم.
     تُفضَّل صيغة WEBP، ونرجع إلى JPEG إذا لم يدعمها المتصفح */
  async function compress(source, { crop = null, maxWidth = 1600, maxHeight = 1600, maxBytes = config.IMAGE_MAX_BYTES } = {}) {
    const { w, h } = dims(source);
    if (!w || !h) throw new AppError('IMAGE_DECODE');
    const sx = crop ? crop.sx : 0;
    const sy = crop ? crop.sy : 0;
    const sw = crop ? crop.sw : w;
    const sh = crop ? crop.sh : h;
    let scale = Math.min(1, maxWidth / sw, maxHeight / sh);

    for (let attempt = 0; attempt < 6; attempt++) {
      const cw = Math.max(1, Math.round(sw * scale));
      const ch = Math.max(1, Math.round(sh * scale));
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, sx, sy, sw, sh, 0, 0, cw, ch);
      for (const q of [0.86, 0.76, 0.66, 0.56]) {
        let blob = await canvasToBlob(canvas, 'image/webp', q);
        if (!blob || blob.type !== 'image/webp') blob = await canvasToBlob(canvas, 'image/jpeg', q);
        if (blob && blob.size <= maxBytes) return blob;
      }
      scale *= 0.75;
    }
    throw new AppError('IMAGE_TOO_LARGE', 'تعذّر ضغط الصورة إلى أقل من 1 ميجا. جرّب صورة أبسط أو أصغر.');
  }

  function url(id) {
    if (!id) return Promise.resolve(null);
    if (!cache.has(id)) {
      cache.set(id, SJ.db.get('images', id)
        .then((rec) => (rec && rec.blob ? URL.createObjectURL(rec.blob) : null))
        .catch(() => null));
    }
    return cache.get(id);
  }

  // صورة لم تُحفظ بعد (في محرر الفئة): نجهّز رابط عرضها مباشرة
  function registerPending(id, blob) {
    forget(id);
    cache.set(id, Promise.resolve(URL.createObjectURL(blob)));
  }

  function forget(id) {
    const p = cache.get(id);
    if (!p) return;
    cache.delete(id);
    p.then((u) => { if (u) URL.revokeObjectURL(u); });
  }

  function clearCache() {
    Array.from(cache.keys()).forEach(forget);
  }

  // ربط عنصر صورة بمعرّف محفوظ
  async function attach(img, id) {
    if (!id) {
      img.hidden = true;
      img.removeAttribute('src');
      return false;
    }
    const u = await url(id);
    if (u) {
      img.src = u;
      img.hidden = false;
      return true;
    }
    img.hidden = true;
    return false;
  }

  SJ.images = { validateFile, decode, compress, url, registerPending, forget, clearCache, attach, dims };
})(window.SJ);
