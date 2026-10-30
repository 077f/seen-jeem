/* دخول الأدمن في النسخة المحلية.
   تنبيه: كل شيء يعمل داخل المتصفح، لذا فكلمة المرور هنا حماية شكلية تمنع العبث العرضي فقط،
   ويستطيع أي شخص لديه وصول للجهاز وأدوات المطور تجاوزها. */
(function (SJ) {
  'use strict';

  const { db, AppError, config, utils } = SJ;
  const SESSION_KEY = 'sj.session';
  const DEFAULT_USERNAME = 'admin';
  const DEFAULT_PASSWORD = 'admin123';
  const ITERATIONS = 150000;

  const toHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

  function randomSalt() {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return toHex(a);
  }

  /* SHA-256 بديل مكتوب بالكامل، يُستخدم فقط إذا لم تتوفر Web Crypto في المتصفح */
  function sha256Hex(text) {
    const bytes = new TextEncoder().encode(text);
    const K = [];
    const H = [];
    const isPrime = (x) => {
      for (let f = 2; f * f <= x; f++) if (x % f === 0) return false;
      return true;
    };
    const frac = (x) => ((x - Math.floor(x)) * 4294967296) | 0;
    for (let n = 2, found = 0; found < 64; n++) {
      if (!isPrime(n)) continue;
      if (found < 8) H[found] = frac(Math.pow(n, 1 / 2));
      K[found] = frac(Math.pow(n, 1 / 3));
      found++;
    }
    const len = bytes.length;
    const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
    padded.set(bytes);
    padded[len] = 0x80;
    const view = new DataView(padded.buffer);
    const bitLen = len * 8;
    view.setUint32(padded.length - 4, bitLen >>> 0);
    view.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296));
    const W = new Int32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let off = 0; off < padded.length; off += 64) {
      for (let i = 0; i < 16; i++) W[i] = view.getInt32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
        const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }

  const hasSubtle = () => !!(window.crypto && crypto.subtle && crypto.subtle.importKey);

  async function computeHash(algo, password, salt, iterations) {
    if (algo === 'pbkdf2-sha256') {
      if (!hasSubtle()) throw new AppError('DB', 'المتصفح الحالي لا يدعم التحقق من كلمة المرور المحفوظة.');
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations, hash: 'SHA-256' }, key, 256);
      return toHex(bits);
    }
    let h = `${salt}:${password}`;
    for (let i = 0; i < 3000; i++) h = sha256Hex(h);
    return h;
  }

  async function makeCredential(password) {
    const salt = randomSalt();
    const algo = hasSubtle() ? 'pbkdf2-sha256' : 'sha256-iter';
    const passwordHash = await computeHash(algo, password, salt, ITERATIONS);
    return { algo, salt, iterations: ITERATIONS, passwordHash };
  }

  // مقارنة بزمن ثابت
  function safeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  async function getAdmin() {
    const rec = await db.get('kv', 'admin');
    return rec ? rec.value : null;
  }

  const saveAdmin = (value) => db.put('kv', { key: 'admin', value });

  async function ensureAdmin() {
    if (await getAdmin()) return;
    const cred = await makeCredential(DEFAULT_PASSWORD);
    await saveAdmin(Object.assign({ username: DEFAULT_USERNAME, isDefaultPassword: true, lastLogin: null, failedAttempts: 0, lockUntil: 0 }, cred));
  }

  function lockMessage(ms) {
    const minutes = Math.ceil(ms / 60000);
    return `${SJ.MESSAGES.LOCKED} حاول مرة أخرى بعد ${minutes === 1 ? 'دقيقة واحدة' : minutes === 2 ? 'دقيقتين' : `${minutes} دقائق`}.`;
  }

  async function lockRemaining() {
    const a = await getAdmin();
    return a && a.lockUntil > Date.now() ? a.lockUntil - Date.now() : 0;
  }

  async function login(username, password) {
    const admin = await getAdmin();
    const now = Date.now();
    if (admin.lockUntil && admin.lockUntil > now) {
      throw new AppError('LOCKED', lockMessage(admin.lockUntil - now), { remainingMs: admin.lockUntil - now });
    }
    const hash = await computeHash(admin.algo, String(password || ''), admin.salt, admin.iterations);
    const userOk = utils.normalize(username).toLowerCase() === admin.username.toLowerCase();
    const ok = safeEqual(hash, admin.passwordHash) && userOk;
    if (!ok) {
      admin.failedAttempts = (admin.failedAttempts || 0) + 1;
      if (admin.failedAttempts >= config.LOGIN_MAX_ATTEMPTS) {
        admin.failedAttempts = 0;
        admin.lockUntil = now + config.LOGIN_LOCK_MS;
        await saveAdmin(admin);
        throw new AppError('LOCKED', lockMessage(config.LOGIN_LOCK_MS), { remainingMs: config.LOGIN_LOCK_MS });
      }
      await saveAdmin(admin);
      throw new AppError('BAD_CREDENTIALS', undefined, { attemptsLeft: config.LOGIN_MAX_ATTEMPTS - admin.failedAttempts });
    }
    admin.failedAttempts = 0;
    admin.lockUntil = 0;
    admin.lastLogin = now;
    await saveAdmin(admin);
    startSession();
    return { username: admin.username, isDefaultPassword: !!admin.isDefaultPassword };
  }

  function readSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    } catch (e) {
      return null;
    }
  }

  function writeSession(value) {
    try {
      if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* التخزين المؤقت غير متاح */ }
  }

  function startSession() {
    writeSession({ expiresAt: Date.now() + config.SESSION_TTL_MS });
  }

  // الجلسة تنتهي بعد ساعتين من آخر نشاط، أو عند إغلاق المتصفح
  function isLoggedIn({ touch = true } = {}) {
    const s = readSession();
    if (!s || !s.expiresAt || s.expiresAt < Date.now()) {
      if (s) writeSession(null);
      return false;
    }
    if (touch) startSession();
    return true;
  }

  function logout() {
    writeSession(null);
  }

  async function changePassword(current, next, confirm) {
    const admin = await getAdmin();
    const hash = await computeHash(admin.algo, String(current || ''), admin.salt, admin.iterations);
    if (!safeEqual(hash, admin.passwordHash)) throw new AppError('WRONG_PASSWORD');
    const pw = String(next || '');
    if (pw.length < 6) throw new AppError('VALIDATION', 'كلمة المرور الجديدة يجب أن تتكون من 6 أحرف على الأقل.');
    if (pw.length > 64) throw new AppError('VALIDATION', 'كلمة المرور الجديدة طويلة جدًا (64 حرفًا كحد أقصى).');
    if (pw !== confirm) throw new AppError('VALIDATION', 'تأكيد كلمة المرور غير مطابق.');
    if (pw === current) throw new AppError('VALIDATION', 'كلمة المرور الجديدة مطابقة للحالية.');
    const cred = await makeCredential(pw);
    await saveAdmin(Object.assign(admin, cred, { isDefaultPassword: false }));
  }

  async function info() {
    const a = await getAdmin();
    return a ? { username: a.username, lastLogin: a.lastLogin, isDefaultPassword: !!a.isDefaultPassword } : null;
  }

  SJ.auth = { ensureAdmin, login, logout, isLoggedIn, changePassword, info, lockRemaining, sha256Hex, DEFAULT_USERNAME, DEFAULT_PASSWORD };
})(window.SJ);
