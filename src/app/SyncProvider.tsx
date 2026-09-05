import { useEffect, useState, type ReactNode } from 'react';
import { SyncEngine, createRemoteAdapter } from '@/sync';
import { useStore } from './storeContext';
import { SyncContext } from './syncContext';

/**
 * Starts the background mirror to Firebase, if one is configured.
 *
 * The engine is created only after the adapter resolves, because loading the
 * Firebase SDK is a dynamic import — an install with no Firebase set up never
 * downloads it. Until then (and forever, if unconfigured) the context is null
 * and the app reports itself as local-only.
 *
 * Everything here is optional by design: local-first is not a fallback mode,
 * it is how the app normally runs.
 */
export function SyncProvider({ children }: { readonly children: ReactNode }) {
  const store = useStore();
  const [engine, setEngine] = useState<SyncEngine | null>(null);

  useEffect(() => {
    let cancelled = false;
    let started: SyncEngine | undefined;

    void createRemoteAdapter().then((remote) => {
      if (cancelled || remote === null) return;
      started = new SyncEngine(store, remote);
      started.start();
      setEngine(started);
    });

    return () => {
      cancelled = true;
      started?.stop();
    };
  }, [store]);

  useEffect(() => {
    if (engine === null) return;
    // Reconnecting is the moment anything pending should go out.
    const onOnline = () => void engine.syncNow();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [engine]);

  return <SyncContext.Provider value={engine}>{children}</SyncContext.Provider>;
}
