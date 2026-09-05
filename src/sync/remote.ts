import type { MetaSnapshot } from '@/store';

/**
 * Everything the sync engine needs from a backend.
 *
 * Kept deliberately small and Firebase-free so the engine's reconciliation
 * logic — the part that can silently corrupt data — is testable without a
 * network, an emulator, or a project.
 */
export interface RemoteAdapter {
  /** Resolves to the signed-in user id, or null when signed out. */
  currentUser(): string | null;
  onUserChange(listener: (uid: string | null) => void): () => void;
  signIn(email: string, password: string): Promise<string>;
  signOut(): Promise<void>;

  fetchDayLogs(uid: string): Promise<unknown[]>;
  fetchMeta(uid: string): Promise<Partial<MetaSnapshot>>;
  putDayLog(uid: string, dayKey: string, log: unknown): Promise<void>;
  putMeta(uid: string, meta: MetaSnapshot): Promise<void>;
}

export type SyncPhase = 'disabled' | 'signed-out' | 'idle' | 'syncing' | 'error' | 'offline';

export interface SyncStatus {
  readonly phase: SyncPhase;
  readonly uid: string | null;
  readonly lastSyncedAt: number | null;
  readonly pendingCount: number;
  readonly message: string | null;
}
