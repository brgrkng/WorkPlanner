import { createContext, useContext, useSyncExternalStore } from 'react';
import type { DayLogStore } from '@/store';

export const StoreContext = createContext<DayLogStore | null>(null);

export function useStore(): DayLogStore {
  const store = useContext(StoreContext);
  if (store === null) throw new Error('useStore must be used inside <StoreProvider>');
  return store;
}

/**
 * Re-renders on any store change.
 *
 * Subscribes to the store's revision counter rather than to the cache itself:
 * the cache is a Map mutated in place, so reference comparison would never
 * detect a change.
 */
export function useStoreVersion(): number {
  const store = useStore();
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.version,
    () => store.version,
  );
}
