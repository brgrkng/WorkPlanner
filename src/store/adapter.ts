/** Named object stores. Kept narrow so a typo cannot silently create one. */
export type StoreName = 'dayLogs' | 'meta';

export const STORE_NAMES: readonly StoreName[] = ['dayLogs', 'meta'];

/**
 * Minimal key-value persistence contract. Deliberately small so the store
 * logic can be tested against an in-memory implementation and the IndexedDB
 * adapter can be verified separately.
 */
export interface StorageAdapter {
  getAll<T>(store: StoreName): Promise<T[]>;
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put(store: StoreName, key: string, value: unknown): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  clear(store: StoreName): Promise<void>;
}

/** In-memory adapter for tests and as a last-resort fallback when IndexedDB is
 *  unavailable (private browsing, blocked storage). */
export class MemoryAdapter implements StorageAdapter {
  private readonly stores = new Map<StoreName, Map<string, unknown>>();

  /** Set to make writes fail, so persistence-failure handling can be tested. */
  failWrites = false;

  private storeFor(store: StoreName): Map<string, unknown> {
    let map = this.stores.get(store);
    if (map === undefined) {
      map = new Map<string, unknown>();
      this.stores.set(store, map);
    }
    return map;
  }

  getAll<T>(store: StoreName): Promise<T[]> {
    return Promise.resolve([...this.storeFor(store).values()] as T[]);
  }

  get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return Promise.resolve(this.storeFor(store).get(key) as T | undefined);
  }

  put(store: StoreName, key: string, value: unknown): Promise<void> {
    if (this.failWrites) return Promise.reject(new Error('write failed'));
    // Structured-clone semantics: stored data must not alias the caller's object.
    this.storeFor(store).set(key, structuredClone(value));
    return Promise.resolve();
  }

  delete(store: StoreName, key: string): Promise<void> {
    if (this.failWrites) return Promise.reject(new Error('write failed'));
    this.storeFor(store).delete(key);
    return Promise.resolve();
  }

  clear(store: StoreName): Promise<void> {
    this.storeFor(store).clear();
    return Promise.resolve();
  }
}
