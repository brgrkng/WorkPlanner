import {
  compareDayKeys,
  createDayLog,
  dayKeyOf,
  defaultDeadlines,
  defaultOffDayRoutineTemplate,
  defaultOfflineTasks,
  defaultRoutineTemplate,
  defaultSettings,
  isOffDay,
  migrateDayLog,
  migrateOffDayTemplate,
  migrateRoutineTemplate,
  reconcileRoutine,
  sanitizeOffDayTemplate,
  type DayKey,
  type DayLog,
  type DayLogIndex,
  type DeadlineList,
  type OfflineTaskList,
  type RoutineTemplate,
  type Settings,
} from '@/domain';
import type { StorageAdapter } from './adapter';

const SETTINGS_KEY = 'settings';
const TEMPLATE_KEY = 'routineTemplate';
const OFF_DAY_TEMPLATE_KEY = 'offDayRoutineTemplate';
const OFFLINE_TASKS_KEY = 'offlineTasks';
const DEADLINES_KEY = 'deadlines';

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
  private currentTemplate: RoutineTemplate = defaultRoutineTemplate(Date.now());
  private currentOffDayTemplate: RoutineTemplate = defaultOffDayRoutineTemplate(Date.now());
  private currentOfflineTasks: OfflineTaskList = defaultOfflineTasks(Date.now());
  private currentDeadlines: DeadlineList = defaultDeadlines(Date.now());
  private readonly listeners = new Set<StoreListener>();

  /** Keys changed since the last successful sync. Consumed by the Firestore
   *  sync layer in M6; maintained here so nothing is missed in the meantime. */
  private readonly dirty = new Set<DayKey>();

  /** Keys whose most recent write did not reach storage. */
  private readonly unpersisted = new Set<DayKey>();

  /** Serialises writes so two updates to one key cannot land out of order. */
  private queue: Promise<void> = Promise.resolve();

  private hydrated = false;
  /** Set when any meta document changes, so the sync layer knows to push. */
  private metaDirtyFlag = false;
  /** Bumped on every change. React subscribes to this rather than to the cache
   *  Map, which is mutated in place and so cannot be compared by reference. */
  private revision = 0;
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
    const [logs, settings, template, offDayTemplate, offlineTasks, deadlines] = await Promise.all([
      this.adapter.getAll<unknown>('dayLogs'),
      this.adapter.get<Settings>('meta', SETTINGS_KEY),
      this.adapter.get<RoutineTemplate>('meta', TEMPLATE_KEY),
      this.adapter.get<RoutineTemplate>('meta', OFF_DAY_TEMPLATE_KEY),
      this.adapter.get<OfflineTaskList>('meta', OFFLINE_TASKS_KEY),
      this.adapter.get<DeadlineList>('meta', DEADLINES_KEY),
    ]);

    this.cache.clear();
    for (const raw of logs) {
      // Records from an older schema are upgraded rather than dropped; one
      // unreadable record must not take down the app or lose the other days.
      const log = migrateDayLog(raw);
      if (log === null) {
        this.lastError = new Error('Skipped an unreadable day log');
        continue;
      }
      this.cache.set(log.dayKey, log);
    }

    if (settings !== undefined) this.currentSettings = { ...defaultSettings(), ...settings };
    // Through the migration, not trusted raw: a template stored before M8 has
    // no work flags, which leaves the timer with no task on every future day.
    if (template !== undefined && Array.isArray(template.blocks)) {
      this.currentTemplate = migrateRoutineTemplate(template, Date.now());
    }
    // Absent is the normal state for anyone who used the app before off-day
    // routines existed; the migration falls back to the off-day default.
    if (offDayTemplate !== undefined) {
      this.currentOffDayTemplate = migrateOffDayTemplate(offDayTemplate, Date.now());
    }
    if (offlineTasks !== undefined && Array.isArray(offlineTasks.tasks)) {
      this.currentOfflineTasks = offlineTasks;
    }
    if (deadlines !== undefined && Array.isArray(deadlines.deadlines)) {
      this.currentDeadlines = deadlines;
    }
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

  /** Monotonic change counter for `useSyncExternalStore`. */
  get version(): number {
    return this.revision;
  }

  private emit(): void {
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }

  // --- reads (synchronous) ---------------------------------------------------

  get settings(): Settings {
    return this.currentSettings;
  }

  /** The user's fallback tasks for an outage (brief section 5). */
  get offlineTasks(): OfflineTaskList {
    return this.currentOfflineTasks;
  }

  /** Deadlines and milestones (brief section 8). */
  get deadlines(): DeadlineList {
    return this.currentDeadlines;
  }

  /** The live routine template. Only ever applied to days created from now on;
   *  past days render from their own snapshot (brief section 7). */
  get template(): RoutineTemplate {
    return this.currentTemplate;
  }

  /** The Friday/Saturday routine. Separate from the workday template: an off
   *  day is its own day, not the workday with the work taken out. */
  get offDayTemplate(): RoutineTemplate {
    return this.currentOffDayTemplate;
  }

  /** The template a given day is snapshotted from or reconciled against. */
  templateFor(dayKey: DayKey): RoutineTemplate {
    return isOffDay(dayKey) ? this.currentOffDayTemplate : this.currentTemplate;
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

    const created = createDayLog(dayKey, this.now(), {
      allocatedMinutesPerWorkday: this.currentSettings.allocatedMinutesPerWorkday,
      template: this.currentTemplate,
      offDayTemplate: this.currentOffDayTemplate,
    });
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
    this.currentSettings = { ...this.currentSettings, ...patch, updatedAt: this.now() };
    this.metaDirtyFlag = true;
    const settings = this.currentSettings;
    this.enqueue(() => this.adapter.put('meta', SETTINGS_KEY, settings));
    this.emit();
    return settings;
  }

  /**
   * Replaces the routine template. Deliberately does not touch any existing day
   * log — the forward-only rule from brief section 7 is enforced here, by the
   * template simply not being part of how a stored day is read.
   */
  /**
   * Replaces the routine template and applies it straight away to today and any
   * later day, preserving what has already been ticked off.
   *
   * Applying it immediately is the point: an edit that only showed up tomorrow
   * required the tab to still be open at the rollover, and was indistinguishable
   * from the edit having been lost.
   *
   * Past days are left exactly as they were. They are the record of what
   * actually happened, every dashboard number is computed from them, and
   * rewriting them would silently change history (brief section 7).
   */
  setTemplate(template: RoutineTemplate): RoutineTemplate {
    this.currentTemplate = template;
    this.metaDirtyFlag = true;
    this.enqueue(() => this.adapter.put('meta', TEMPLATE_KEY, template));
    this.applyTemplateFromToday();
    this.emit();
    return template;
  }

  /**
   * Replaces the Friday/Saturday routine. Same rules as the workday template:
   * applied to today and later immediately, past days untouched.
   */
  setOffDayTemplate(template: RoutineTemplate): RoutineTemplate {
    const safe = sanitizeOffDayTemplate(template);
    this.currentOffDayTemplate = safe;
    this.metaDirtyFlag = true;
    this.enqueue(() => this.adapter.put('meta', OFF_DAY_TEMPLATE_KEY, safe));
    this.applyTemplateFromToday();
    this.emit();
    return safe;
  }

  /**
   * Brings today and every later day into line with whichever template governs
   * it. Each day is reconciled against its own kind's template, so editing the
   * workday routine never touches a Saturday and vice versa.
   */
  private applyTemplateFromToday(): void {
    const today = this.today();
    // Keys snapshotted first: `update` writes back into the cache.
    for (const dayKey of [...this.cache.keys()]) {
      if (compareDayKeys(dayKey, today) < 0) continue;

      const log = this.cache.get(dayKey);
      if (log === undefined) continue;

      const routine = reconcileRoutine(log.routine, this.templateFor(dayKey));
      if (routine === log.routine) continue;
      this.update(dayKey, (current) => ({ ...current, routine }));
    }
  }

  setOfflineTasks(list: OfflineTaskList): OfflineTaskList {
    this.currentOfflineTasks = list;
    this.metaDirtyFlag = true;
    this.enqueue(() => this.adapter.put('meta', OFFLINE_TASKS_KEY, list));
    this.emit();
    return list;
  }

  setDeadlines(list: DeadlineList): DeadlineList {
    this.currentDeadlines = list;
    this.metaDirtyFlag = true;
    this.enqueue(() => this.adapter.put('meta', DEADLINES_KEY, list));
    this.emit();
    return list;
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

  /** Called by the sync layer once a key has reached Firestore. */
  markSynced(dayKey: DayKey): void {
    this.dirty.delete(dayKey);
  }

  // --- sync surface ----------------------------------------------------------

  get metaDirty(): boolean {
    return this.metaDirtyFlag;
  }

  markMetaSynced(): void {
    this.metaDirtyFlag = false;
  }

  get meta(): MetaSnapshot {
    return {
      settings: this.currentSettings,
      template: this.currentTemplate,
      offDayTemplate: this.currentOffDayTemplate,
      offlineTasks: this.currentOfflineTasks,
      deadlines: this.currentDeadlines,
    };
  }

  /**
   * Applies a day log that came from the server.
   *
   * Last-write-wins on `updatedAt`, and the local copy wins ties — a local edit
   * the user just made must never be silently replaced by an identical-age
   * remote copy. Applying a remote log does NOT mark it dirty; it is already on
   * the server. Returns whether anything changed.
   */
  mergeRemoteDayLog(raw: unknown): boolean {
    const incoming = migrateDayLog(raw);
    if (incoming === null) return false;

    const existing = this.cache.get(incoming.dayKey);
    if (existing !== undefined && existing.updatedAt >= incoming.updatedAt) return false;

    this.cache.set(incoming.dayKey, incoming);
    this.emit();
    // Persist locally so the merge survives a restart, without re-dirtying it.
    this.enqueue(() => this.adapter.put('dayLogs', incoming.dayKey, incoming));
    return true;
  }

  /** Same last-write-wins rule for the meta documents. */
  mergeRemoteMeta(meta: Partial<MetaSnapshot>): boolean {
    let changed = false;

    if (meta.settings !== undefined && meta.settings.updatedAt > this.currentSettings.updatedAt) {
      this.currentSettings = { ...defaultSettings(), ...meta.settings };
      this.enqueue(() => this.adapter.put('meta', SETTINGS_KEY, this.currentSettings));
      changed = true;
    }
    if (meta.template !== undefined && meta.template.updatedAt > this.currentTemplate.updatedAt) {
      // Migrated, not trusted raw: a template synced from an older build has no
      // work flags, which would leave the timer with no task to point at.
      this.currentTemplate = migrateRoutineTemplate(meta.template, this.now());
      this.enqueue(() => this.adapter.put('meta', TEMPLATE_KEY, this.currentTemplate));
      // Same rule as a local edit: today follows the template immediately.
      this.applyTemplateFromToday();
      changed = true;
    }
    if (
      meta.offDayTemplate !== undefined &&
      meta.offDayTemplate.updatedAt > this.currentOffDayTemplate.updatedAt
    ) {
      this.currentOffDayTemplate = migrateOffDayTemplate(meta.offDayTemplate, this.now());
      this.enqueue(() =>
        this.adapter.put('meta', OFF_DAY_TEMPLATE_KEY, this.currentOffDayTemplate),
      );
      this.applyTemplateFromToday();
      changed = true;
    }
    if (
      meta.offlineTasks !== undefined &&
      meta.offlineTasks.updatedAt > this.currentOfflineTasks.updatedAt
    ) {
      this.currentOfflineTasks = meta.offlineTasks;
      this.enqueue(() => this.adapter.put('meta', OFFLINE_TASKS_KEY, this.currentOfflineTasks));
      changed = true;
    }
    if (
      meta.deadlines !== undefined &&
      meta.deadlines.updatedAt > this.currentDeadlines.updatedAt
    ) {
      this.currentDeadlines = meta.deadlines;
      this.enqueue(() => this.adapter.put('meta', DEADLINES_KEY, this.currentDeadlines));
      changed = true;
    }

    if (changed) this.emit();
    return changed;
  }
}

export interface MetaSnapshot {
  readonly settings: Settings;
  readonly template: RoutineTemplate;
  readonly offDayTemplate: RoutineTemplate;
  readonly offlineTasks: OfflineTaskList;
  readonly deadlines: DeadlineList;
}
