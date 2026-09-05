import { createContext, useContext, useSyncExternalStore } from 'react';
import type { SyncEngine, SyncStatus } from '@/sync';

export const SyncContext = createContext<SyncEngine | null>(null);

/** Null when sync was never constructed (it is entirely optional). */
export function useSyncEngine(): SyncEngine | null {
  return useContext(SyncContext);
}

const DISABLED: SyncStatus = {
  phase: 'disabled',
  uid: null,
  lastSyncedAt: null,
  pendingCount: 0,
  message: null,
};

export function useSyncStatus(): SyncStatus {
  const engine = useContext(SyncContext);
  return useSyncExternalStore(
    (listener) => engine?.subscribe(listener) ?? (() => undefined),
    () => engine?.getStatus() ?? DISABLED,
    () => engine?.getStatus() ?? DISABLED,
  );
}
