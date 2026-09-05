import type { DayLogStore } from '@/store';
import type { RemoteAdapter, SyncStatus } from './remote';

const DEFAULT_DEBOUNCE_MS = 2_000;

export interface SyncEngineOptions {
  readonly debounceMs?: number;
  readonly now?: () => number;
  readonly isOnline?: () => boolean;
}

/**
 * Pushes local changes to the backend and pulls remote ones back.
 *
 * Three rules keep this from ever being able to lose data:
 *
 * 1. **Local is the source of truth.** The app reads and writes the local store
 *    only; sync is a background mirror. If the backend is unreachable, missing,
 *    or misconfigured, nothing above this layer notices (brief section 5).
 * 2. **Nothing is marked synced until the write actually succeeded.** A failed
 *    push leaves the key dirty, so it is retried rather than dropped.
 * 3. **Merging is last-write-wins on `updatedAt`, and local wins ties.** A
 *    change the user just made is never silently replaced.
 */
export class SyncEngine {
  private status: SyncStatus;
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private unsubscribeStore: (() => void) | undefined;
  private unsubscribeAuth: (() => void) | undefined;
  private running = false;
  private inFlight: Promise<void> = Promise.resolve();

  private readonly debounceMs: number;
  private readonly now: () => number;
  private readonly isOnline: () => boolean;

  constructor(
    private readonly store: DayLogStore,
    private readonly remote: RemoteAdapter | null,
    options: SyncEngineOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.now = options.now ?? (() => Date.now());
    this.isOnline = options.isOnline ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine));

    this.status = {
      phase: remote === null ? 'disabled' : remote.currentUser() === null ? 'signed-out' : 'idle',
      uid: remote?.currentUser() ?? null,
      lastSyncedAt: null,
      pendingCount: 0,
      message: null,
    };
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setStatus(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const listener of this.listeners) listener();
  }

  private pendingCount(): number {
    return this.store.dirtyKeys.size + (this.store.metaDirty ? 1 : 0);
  }

  /** Begins mirroring. Safe to call when there is no backend configured. */
  start(): void {
    if (this.running || this.remote === null) return;
    this.running = true;
    const remote = this.remote;

    this.unsubscribeAuth = remote.onUserChange((uid) => {
      this.setStatus({ uid, phase: uid === null ? 'signed-out' : 'idle' });
      if (uid !== null) void this.syncNow();
    });

    this.unsubscribeStore = this.store.subscribe(() => {
      this.setStatus({ pendingCount: this.pendingCount() });
      this.schedule();
    });

    if (remote.currentUser() !== null) void this.syncNow();
  }

  stop(): void {
    this.running = false;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.unsubscribeStore?.();
    this.unsubscribeAuth?.();
  }

  /** Coalesces a burst of edits into one push. */
  private schedule(): void {
    if (!this.running || this.remote?.currentUser() == null) return;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.syncNow();
    }, this.debounceMs);
  }

  async signIn(email: string, password: string): Promise<void> {
    if (this.remote === null) throw new Error('Sync is not configured');
    this.setStatus({ phase: 'syncing', message: null });
    try {
      const uid = await this.remote.signIn(email, password);
      this.setStatus({ uid, phase: 'idle' });
      await this.syncNow();
    } catch (error) {
      this.setStatus({ phase: 'error', message: describe(error) });
      throw error;
    }
  }

  async signOut(): Promise<void> {
    if (this.remote === null) return;
    await this.remote.signOut();
    this.setStatus({ uid: null, phase: 'signed-out', message: null });
  }

  /** Pull, then push. Serialised so two runs can never interleave. */
  syncNow(): Promise<void> {
    this.inFlight = this.inFlight.then(() => this.runOnce());
    return this.inFlight;
  }

  private async runOnce(): Promise<void> {
    const remote = this.remote;
    if (remote === null) return;

    const uid = remote.currentUser();
    if (uid === null) {
      this.setStatus({ phase: 'signed-out' });
      return;
    }

    if (!this.isOnline()) {
      // Not an error: the app is designed to run offline for hours. Local data
      // is intact and everything still pending will be retried on reconnect.
      this.setStatus({ phase: 'offline', pendingCount: this.pendingCount() });
      return;
    }

    this.setStatus({ phase: 'syncing', message: null });

    try {
      await this.pull(uid);
      await this.push(uid);
      this.setStatus({
        phase: 'idle',
        lastSyncedAt: this.now(),
        pendingCount: this.pendingCount(),
        message: null,
      });
    } catch (error) {
      // Anything still dirty stays dirty and is retried; nothing is dropped.
      this.setStatus({
        phase: 'error',
        message: describe(error),
        pendingCount: this.pendingCount(),
      });
    }
  }

  private async pull(uid: string): Promise<void> {
    const remote = this.remote;
    if (remote === null) return;

    const [logs, meta] = await Promise.all([remote.fetchDayLogs(uid), remote.fetchMeta(uid)]);
    for (const log of logs) this.store.mergeRemoteDayLog(log);
    this.store.mergeRemoteMeta(meta);
  }

  private async push(uid: string): Promise<void> {
    const remote = this.remote;
    if (remote === null) return;

    for (const dayKey of [...this.store.dirtyKeys]) {
      const log = this.store.get(dayKey);
      if (log === undefined) {
        this.store.markSynced(dayKey);
        continue;
      }
      await remote.putDayLog(uid, dayKey, log);
      // Only after the write resolved — a failure above leaves it dirty.
      this.store.markSynced(dayKey);
    }

    if (this.store.metaDirty) {
      await remote.putMeta(uid, this.store.meta);
      this.store.markMetaSynced();
    }
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
