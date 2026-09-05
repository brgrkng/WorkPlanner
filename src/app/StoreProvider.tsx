import { useEffect, useState, type ReactNode } from 'react';
import { DayLogStore, IdbAdapter, MemoryAdapter, isIndexedDbAvailable } from '@/store';
import { StoreContext } from './storeContext';

interface Props {
  readonly children: ReactNode;
  /** Injected by tests; production builds create the IndexedDB-backed store. */
  readonly store?: DayLogStore;
}

function createStore(): DayLogStore {
  // Falling back to memory keeps the app usable in private-browsing mode: the
  // timer still runs and the day still tracks, it just will not survive a
  // reload. Refusing to start would be worse.
  return new DayLogStore(isIndexedDbAvailable() ? new IdbAdapter() : new MemoryAdapter());
}

/**
 * Creates and hydrates the local store before rendering anything that reads it.
 * Hydration is the one place the app waits on storage; every read after this is
 * a synchronous cache lookup.
 */
export function StoreProvider({ children, store }: Props) {
  const [instance] = useState<DayLogStore>(() => store ?? createStore());
  const [ready, setReady] = useState(instance.isHydrated);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (instance.isHydrated) {
      setReady(true);
      return;
    }
    let cancelled = false;
    instance
      .hydrate()
      .catch(() => {
        // Starting with an empty cache is better than not starting at all;
        // writes will still be attempted and surfaced if they fail.
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [instance]);

  if (!ready) return null;

  return (
    <StoreContext.Provider value={instance}>
      {failed ? (
        <p role="alert">
          Stored data could not be loaded. The app is running, but today may start empty.
        </p>
      ) : null}
      {children}
    </StoreContext.Provider>
  );
}
