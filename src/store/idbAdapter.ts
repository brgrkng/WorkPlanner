import { STORE_NAMES, type StorageAdapter, type StoreName } from './adapter';

export const DB_NAME = 'workplanner';
export const DB_VERSION = 1;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

export function openDatabase(name = DB_NAME, version = DB_VERSION): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of STORE_NAMES) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
    req.onblocked = () => reject(new Error('IndexedDB open blocked by another tab'));
  });
}

/**
 * IndexedDB-backed persistence. Chosen over localStorage because it survives
 * more aggressive cleanup, has no practical size ceiling for this data, and
 * does not block the main thread — the timer must keep ticking while writes
 * happen (brief section 5).
 */
export class IdbAdapter implements StorageAdapter {
  private dbPromise: Promise<IDBDatabase> | undefined;

  constructor(
    private readonly name = DB_NAME,
    private readonly version = DB_VERSION,
  ) {}

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= openDatabase(this.name, this.version);
    return this.dbPromise;
  }

  private async transact<T>(
    store: StoreName,
    mode: IDBTransactionMode,
    run: (objectStore: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.db();
    const tx = db.transaction(store, mode);
    const result = await request(run(tx.objectStore(store)));
    // Wait for the transaction itself, not just the request: a write is not
    // durable until the transaction commits.
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
    return result;
  }

  getAll<T>(store: StoreName): Promise<T[]> {
    return this.transact(store, 'readonly', (os) => os.getAll() as IDBRequest<T[]>);
  }

  get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return this.transact(store, 'readonly', (os) => os.get(key) as IDBRequest<T | undefined>);
  }

  async put(store: StoreName, key: string, value: unknown): Promise<void> {
    await this.transact(store, 'readwrite', (os) => os.put(value, key));
  }

  async delete(store: StoreName, key: string): Promise<void> {
    await this.transact(store, 'readwrite', (os) => os.delete(key));
  }

  async clear(store: StoreName): Promise<void> {
    await this.transact(store, 'readwrite', (os) => os.clear());
  }

  async close(): Promise<void> {
    if (this.dbPromise === undefined) return;
    const db = await this.dbPromise;
    db.close();
    this.dbPromise = undefined;
  }
}

/** True when IndexedDB is usable at all. Private-mode browsers expose the API
 *  but throw on open, so this only reports presence — callers must still handle
 *  a rejected open. */
export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}
