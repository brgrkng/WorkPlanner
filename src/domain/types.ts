import type { DayKey } from './time/dayKey';

/** Answer to the per-pomodoro social-media honesty check-in (brief section 6.2).
 *  `unanswered` is deliberately distinct from `no` — the check-in is
 *  non-blocking, so silence must not be recorded as a failure. */
export type DistractionAnswer = 'yes' | 'no' | 'unanswered';

export type WorkSessionSource = 'pomodoro' | 'manual';

/**
 * A stretch of tracked work. Duration is derived from the timestamps rather
 * than stored, so a session can never disagree with itself.
 *
 * A session is attributed entirely to the logical day of `startedAt`. With a
 * 04:00 rollover a session would have to cross 4am to span two logical days,
 * which does not happen in practice for this schedule.
 */
export interface WorkSession {
  readonly id: string;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly source: WorkSessionSource;
  readonly distractionFree: DistractionAnswer;

  /**
   * Total time this session spent paused. Subtracted from the wall-clock span
   * so that pausing is honest in both directions: the real start and end
   * instants are preserved, but paused time is not credited as work.
   */
  readonly pausedMs: number;

  /**
   * Whether the session reached the full work interval configured at the time
   * it ended. Snapshotted rather than derived so that raising the interval
   * later cannot retroactively un-complete past pomodoros. Drives the
   * long-break cadence (brief section 4).
   */
  readonly completedFullInterval: boolean;
  /** True when the session was closed by crash recovery rather than by the
   *  user, i.e. its end is the last heartbeat before power loss. */
  readonly recovered: boolean;
}

/**
 * Manual self-report covering a stretch of time the app could not observe,
 * typically a power cut (brief section 5). `worked: false` contributes nothing
 * and must never drive punitive UI.
 */
export interface OfflineReport {
  readonly id: string;
  readonly startedAt: number;
  readonly minutes: number;
  readonly worked: boolean;
  readonly note: string;
}

/** Snapshotted at log creation so that later template edits cannot rewrite
 *  history, and so Fri/Sat stay identifiable even if the routine changes. */
export type DayKind = 'workday' | 'offday';

/**
 * One day's immutable record. Every dashboard number is computed from these
 * and never from the live routine template (brief section 7).
 */
export interface DayLog {
  readonly schemaVersion: number;
  readonly dayKey: DayKey;
  readonly kind: DayKind;

  /**
   * Excused days drop out of the math entirely: zero allocated, zero actual,
   * and skipped by streaks exactly like Fri/Sat. See SESSION.md decisions 6-7.
   */
  readonly excused: boolean;

  /** Snapshot of the scheduled workday length when this log was created.
   *  Always 0 for an offday. */
  readonly allocatedMinutes: number;

  readonly workSessions: readonly WorkSession[];
  readonly offlineReports: readonly OfflineReport[];

  /** Informational only — lunch counts as neither actual nor allocated time
   *  (brief section 3). */
  readonly lunchMinutes: number;

  readonly cigarettes: number;

  /** Morning self-report that the prior night's sleep was broken. */
  readonly sleepDebt: boolean;
  readonly note: string;

  readonly createdAt: number;
  readonly updatedAt: number;
}

/** User-adjustable settings. Changing these affects future days only; each
 *  DayLog carries its own snapshot of anything that feeds the math. */
export interface Settings {
  readonly schemaVersion: number;
  readonly workIntervalMinutes: number;
  readonly shortBreakMinutes: number;
  readonly longBreakMinutes: number;
  readonly longBreakEvery: number;
  readonly allocatedMinutesPerWorkday: number;
  readonly workStreakThresholdMinutes: number;
  readonly rolloverHour: number;
}

export type DayLogIndex = ReadonlyMap<DayKey, DayLog>;
