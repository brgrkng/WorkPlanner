import {
  createDayLog,
  dayKeyOf,
  defaultSettings,
  parseDayKey,
  type DayKey,
  type DayLog,
  type DayLogIndex,
  type Settings,
} from '@/domain';
import type { StorageAdapter } from './adapter';

const SETTINGS_KEY = 'settings';

export interface StoreOptions {
  /** Injected so tests and the domain layer never read the wall clock directly. */
  readonly now?: () => number;
}

export type StoreListener = () => void;

/**
 * Local source of truth for day logs.
 *
 * Write-first: every mutation lands in the in-memory cache synchronously and is
 * returned immediately, then persisted to IndexedDB in the background. Reads
 * are synchronous cache lookups. Nothing in the app ever waits on storage to
 * render or to keep a timer running, which is what makes the app work through a
 * power cut and with no network at all (brief section 5).
 *
 * Persistence failures are surfaced rather than swallowed: a failed write keeps
 * its key in `unpersistedKeys` and sets `lastError`, and `flush()` retries from
 * the cache. Data already in memory is never dropped because a write failed.
 */
export class DayLogStore {
  private readonly cache = new Map<DayKey, DayLog>();
  private currentSettings: Settings = defaultSettings();
  private readonly listeners = new Set<StoreListener>();

  /** Keys changed since the last successful sync. Consumed by the Firestore
   *  sync layer in M6; maintained here so nothing is missed in the meantime. */
  private readonly dirty = new Set<DayKey>();

  /** Keys whose most recent write did not reach storage. */
  private readonly unpersisted = new Set<DayKey>();

  /** Serialises writes so two updates to one key cannot land out of order. */
  private queue: Promise<void> = Promise.resolve();

  private hydrated = false;
  private lastError: unknown = undefined;
  private readonly now: () => number;

  constructor(
    private readonly adapter: StorageAdapter,
    options: StoreOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
  }

  /** Loads everything into memory. Call once at startup, before first render. */
  async hydrate(): Promise<void> {
    const [logs, settings] = await Promise.all([
      this.adapter.getAll<DayLog>('dayLogs'),
      this.adapter.get<Settings>('meta', SETTINGS_KEY),
    ]);

    this.cache.clear();
    for (const log of logs) {
      // A corrupt key must not take down the whole app: skip it and keep going.
      try {
        this.cache.set(parseDayKey(log.dayKey), log);
      } catch (error) {
        this.lastError = error;
      }
    }

    if (settings !== undefined) this.currentSettings = { ...defaultSettings(), ...settings };
    this.hydrated = true;
    this.emit();
  }

  get isHydrated(): boolean {
    return this.hydrated;
  }

  get error(): unknown {
    return this.lastError;
  }

  /** Keys whose latest write failed to persist. Non-empty means memory and
   *  storage disagree — the UI should say so rather than pretend all is well. */
  get unpersistedKeys(): ReadonlySet<DayKey> {
    return this.unpersisted;
  }

  get dirtyKeys(): ReadonlySet<DayKey> {
    return this.dirty;
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  // --- reads (synchronous) ---------------------------------------------------

  get settings(): Settings {
    return this.currentSettings;
  }

  get(dayKey: DayKey): DayLog | undefined {
    return this.cache.get(dayKey);
  }

  all(): DayLogIndex {
    return this.cache;
  }

  /** The logical day for an instant, using the configured rollover hour. */
  dayKeyFor(instant: Date = new Date(this.now())): DayKey {
    return dayKeyOf(instant, this.currentSettings.rolloverHour);
  }

  today(): DayKey {
    return this.dayKeyFor();
  }

  // --- writes (cache-synchronous, storage-eventual) --------------------------

  /**
   * Returns the day's log, creating it if absent. Creation snapshots the
   * current allocated workday length so later settings changes cannot rewrite
   * this day (brief section 7).
   */
  ensureDay(dayKey: DayKey): DayLog {
    const existing = this.cache.get(dayKey);
    if (existing !== undefined) return existing;

    const created = createDayLog(
      dayKey,
      this.now(),
      this.currentSettings.allocatedMinutesPerWorkday,
    );
    this.commit(created);
    return created;
  }

  /**
   * Applies a change to a day, creating the day first if needed. The mutator
   * receives the current log and must return a new one — logs are treated as
   * immutable so a stale reference can never be mutated underneath a render.
   */
  update(dayKey: DayKey, mutate: (log: DayLog) => DayLog): DayLog {
    const current = this.ensureDay(dayKey);
    const next = { ...mutate(current), dayKey, updatedAt: this.now() };
    this.commit(next);
    return next;
  }

  updateSettings(patch: Partial<Settings>): Settings {
    this.currentSettings = { ...this.currentSettings, ...patch };
    const settings = this.currentSettings;
    this.enqueue(() => this.adapter.put('meta', SETTINGS_KEY, settings));
    this.emit();
    return settings;
  }

  private commit(log: DayLog): void {
    this.cache.set(log.dayKey, log);
    this.dirty.add(log.dayKey);
    this.emit();
    this.enqueue(async () => {
      await this.adapter.put('dayLogs', log.dayKey, log);
      this.unpersisted.delete(log.dayKey);
    }, log.dayKey);
  }

  private enqueue(write: () => Promise<void>, dayKey?: DayKey): void {
    this.queue = this.queue.then(async () => {
      try {
        await write();
      } catch (error) {
        this.lastError = error;
        if (dayKey !== undefined) this.unpersisted.add(dayKey);
        this.emit();
      }
    });
  }

  /** Resolves once every queued write has been attempted. */
  async settled(): Promise<void> {
    await this.queue;
  }

  /**
   * Retries every write that previously failed, from the current cache state.
   * Safe to call on reconnect, on visibility change, or from a retry button.
   */
  async flush(): Promise<void> {
    for (const dayKey of [...this.unpersisted]) {
      const log = this.cache.get(dayKey);
      if (log === undefined) {
        this.unpersisted.delete(dayKey);
        continue;
      }
      this.enqueue(async () => {
        await this.adapter.put('dayLogs', dayKey, log);
        this.unpersisted.delete(dayKey);
      }, dayKey);
    }
    await this.settled();
    this.emit();
  }

  /** Called by the sync layer once a key has reached Firestore (M6). */
  markSynced(dayKey: DayKey): void {
    this.dirty.delete(dayKey);
  }
}
