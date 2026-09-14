// IndexedDB-backed blob store for pictures: { get, put, delete, clear }.

const DB_NAME = 'dartboard';
const STORE_NAME = 'images';

/** Opens the store, or resolves null when IndexedDB isn't usable here. */
export function openImageStore() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let request;
    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(wrap(request.result));
    request.onerror = () => resolve(null);
  });
}

function wrap(db) {
  const run = (mode, action) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = action(tx.objectStore(STORE_NAME));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error); // e.g. QuotaExceededError
    });

  return {
    get: (id) => run('readonly', (store) => store.get(id)),
    put: (id, blob) => run('readwrite', (store) => store.put(blob, id)).then(() => undefined),
    delete: (id) => run('readwrite', (store) => store.delete(id)).then(() => undefined),
    clear: () => run('readwrite', (store) => store.clear()).then(() => undefined),
  };
}
