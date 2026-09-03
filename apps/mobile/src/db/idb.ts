/**
 * A very small IndexedDB wrapper.
 *
 * IndexedDB rather than localStorage because a camp device may hold a whole
 * day of unsynced records plus the offline reference bundle, which exceeds
 * what localStorage can safely carry, and because localStorage writes block
 * the main thread on a slow tablet.
 */

const DB_NAME = 'mgms-camp';
const DB_VERSION = 1;

export const STORES = {
  outbox: 'outbox',
  walkIns: 'walkIns',
  bundle: 'bundle',
  meta: 'meta',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.outbox)) {
        const outbox = db.createObjectStore(STORES.outbox, { keyPath: 'clientId' });
        outbox.createIndex('queuedAt', 'queuedAt');
        outbox.createIndex('status', 'status');
      }
      if (!db.objectStoreNames.contains(STORES.walkIns)) {
        const walkIns = db.createObjectStore(STORES.walkIns, { keyPath: 'clientId' });
        walkIns.createIndex('stage', 'stage');
        walkIns.createIndex('registeredAt', 'registeredAt');
      }
      if (!db.objectStoreNames.contains(STORES.bundle)) db.createObjectStore(STORES.bundle);
      if (!db.objectStoreNames.contains(STORES.meta)) db.createObjectStore(STORES.meta);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the local database'));
  });
  return dbPromise;
}

async function run<T>(
  store: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = operation(transaction.objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Local database operation failed'));
  });
}

export const idb = {
  get: <T>(store: string, key: IDBValidKey) => run<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>),
  getAll: <T>(store: string) => run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>),
  put: <T>(store: string, value: T, key?: IDBValidKey) =>
    run(store, 'readwrite', (s) => s.put(value as never, key)),
  delete: (store: string, key: IDBValidKey) => run(store, 'readwrite', (s) => s.delete(key)),
  clear: (store: string) => run(store, 'readwrite', (s) => s.clear()),
};

/** True when the browser will actually give us storage. */
export async function isStorageAvailable(): Promise<boolean> {
  try {
    await openDatabase();
    return true;
  } catch {
    return false;
  }
}

/**
 * Ask the browser not to evict our data under storage pressure. Without this a
 * device that fills up can silently drop a camp's unsynced records.
 */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
