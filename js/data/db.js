/* غلاف IndexedDB: فتح القاعدة، المعاملات، وتحويل أخطاء امتلاء المساحة إلى رسالة مفهومة */
(function (SJ) {
  'use strict';

  const { AppError } = SJ;
  const DB_NAME = 'seen-jeem';
  const DB_VERSION = 1;
  let dbPromise = null;

  function wrapError(err) {
    if (err instanceof AppError || (err && err.name === 'EngineError')) return err;
    const name = err && err.name;
    const msg = (err && err.message) || '';
    if (name === 'QuotaExceededError' || /quota/i.test(msg)) return new AppError('STORAGE_FULL');
    console.error('[db]', err);
    return new AppError('DB', undefined, err);
  }

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window) || !window.indexedDB) {
        reject(new AppError('NO_STORAGE'));
        return;
      }
      let request;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        reject(new AppError('NO_STORAGE'));
        return;
      }
      // إنشاء المخازن عند أول تشغيل أو عند ترقية الإصدار
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('categories')) db.createObjectStore('categories', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('questions')) {
          const qs = db.createObjectStore('questions', { keyPath: 'id' });
          qs.createIndex('categoryId', 'categoryId', { unique: false });
        }
        if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('matches')) {
          const ms = db.createObjectStore('matches', { keyPath: 'id' });
          ms.createIndex('status', 'status', { unique: false });
        }
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => reject(new AppError('NO_STORAGE', undefined, request.error));
      request.onblocked = () => reject(new AppError('DB', 'التطبيق مفتوح في نافذة أخرى بإصدار مختلف. أغلق النوافذ الأخرى ثم أعد التحميل.'));
    });
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  }

  function req(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(wrapError(request.error));
    });
  }

  /* تنفيذ عدة عمليات ضمن معاملة واحدة ذرّية.
     fn تستقبل كائنًا بالمخازن، وأي خطأ يُلغي المعاملة بالكامل */
  async function tx(storeNames, mode, fn) {
    const db = await open();
    const names = [].concat(storeNames);
    return new Promise((resolve, reject) => {
      let t;
      try {
        t = db.transaction(names, mode);
      } catch (e) {
        reject(wrapError(e));
        return;
      }
      const stores = {};
      names.forEach((n) => { stores[n] = t.objectStore(n); });
      let result;
      let failure = null;
      t.oncomplete = () => resolve(result);
      t.onerror = (e) => { e.preventDefault(); };
      t.onabort = () => reject(failure || wrapError(t.error));
      Promise.resolve()
        .then(() => fn(stores, t))
        .then((r) => { result = r; })
        .catch((err) => {
          failure = wrapError(err);
          try { t.abort(); } catch (e) { reject(failure); }
        });
    });
  }

  const get = (store, key) => tx(store, 'readonly', (s) => req(s[store].get(key)));
  const getAll = (store) => tx(store, 'readonly', (s) => req(s[store].getAll()));
  const put = (store, value) => tx(store, 'readwrite', (s) => req(s[store].put(value)));
  const del = (store, key) => tx(store, 'readwrite', (s) => req(s[store].delete(key)));
  const byIndex = (store, index, key) => tx(store, 'readonly', (s) => req(s[store].index(index).getAll(key)));

  SJ.db = { open, tx, req, get, getAll, put, del, byIndex, wrapError };
})(window.SJ);
