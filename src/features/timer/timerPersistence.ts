import type { DayKey, Settings, WorkSession } from '@/domain';
import { reachedFullInterval } from '@/domain';
import { IDLE, type TimerState } from './timerState';

export const TIMER_STORAGE_KEY = 'workplanner.timer';
export const TIMER_SNAPSHOT_VERSION = 1;

/**
 * How often the running timer writes its heartbeat. Worst-case loss from an
 * unannounced power cut is one interval, so this is the accuracy floor for
 * crash recovery: three seconds of a six-hour day.
 */
export const HEARTBEAT_INTERVAL_MS = 3_000;

/**
 * Anything longer than this is a clock anomaly or a machine that slept, not a
 * work session. Recovery credits at most this much so a bad timestamp cannot
 * silently inject a fake twelve-hour day into the accountability numbers.
 */
export const MAX_RECOVERABLE_MS = 12 * 60 * 60 * 1000;

export interface TimerSnapshot {
  readonly version: number;
  readonly state: TimerState;
  /** Last moment the app was known to be alive. */
  readonly heartbeatAt: number;
}

/** The subset of the Storage API used here, so tests need no DOM. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The heartbeat deliberately uses localStorage rather than IndexedDB.
 *
 * localStorage writes are synchronous: once `setItem` returns, the value is
 * committed. An IndexedDB transaction is asynchronous and may still be in
 * flight when the power cuts, losing the very write that mattered most. The
 * data is tiny and write frequency is low, so the usual reasons to avoid
 * localStorage do not apply. Completed sessions still go to IndexedDB via
 * DayLogStore — only the volatile heartbeat lives here.
 */
export function browserStorage(): KeyValueStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    // Private-mode browsers expose the API but throw on write.
    const probe = '__workplanner_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

export function writeSnapshot(
  storage: KeyValueStorage | null,
  state: TimerState,
  heartbeatAt: number,
): void {
  if (storage === null) return;
  if (state.phase === 'idle') {
    clearSnapshot(storage);
    return;
  }
  const snapshot: TimerSnapshot = { version: TIMER_SNAPSHOT_VERSION, state, heartbeatAt };
  try {
    storage.setItem(TIMER_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // A full or blocked store must never take down a running timer. The
    // in-memory timer keeps working; only crash recovery degrades.
  }
}

export function clearSnapshot(storage: KeyValueStorage | null): void {
  if (storage === null) return;
  try {
    storage.removeItem(TIMER_STORAGE_KEY);
  } catch {
    // Ignore — see writeSnapshot.
  }
}

export function readSnapshot(storage: KeyValueStorage | null): TimerSnapshot | null {
  if (storage === null) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(TIMER_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isSnapshot(parsed)) return null;
    if (parsed.version !== TIMER_SNAPSHOT_VERSION) return null;
    return parsed;
  } catch {
    // Corrupt JSON is not worth crashing over; the day's logged sessions are
    // in IndexedDB and unaffected.
    return null;
  }
}

function isSnapshot(value: unknown): value is TimerSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<TimerSnapshot>;
  if (typeof candidate.version !== 'number') return false;
  if (typeof candidate.heartbeatAt !== 'number') return false;
  const state = candidate.state as Partial<TimerState> | undefined;
  if (typeof state !== 'object' || state === null) return false;
  return state.phase === 'work' || state.phase === 'break' || state.phase === 'idle';
}

export interface Recovery {
  /** The session to credit, or null when there was nothing to recover. */
  readonly session: WorkSession | null;
  /** The day the session belongs to — not necessarily today, if the outage
   *  spanned the 04:00 rollover. */
  readonly dayKey: DayKey | null;
  /** True when the recovered time was clamped by MAX_RECOVERABLE_MS. */
  readonly clamped: boolean;
}

const NOTHING: Recovery = { session: null, dayKey: null, clamped: false };

/**
 * Reconstructs the work session that was running when the app died.
 *
 * Elapsed time is measured to the last heartbeat, never to "now" — the machine
 * may have been off for an hour, and only the time up to the last known-alive
 * moment was actually worked. Per SESSION.md decision 2 this is credited
 * automatically with no prompt.
 */
export function recoverFromSnapshot(
  snapshot: TimerSnapshot | null,
  settings: Settings,
): Recovery {
  if (snapshot === null) return NOTHING;

  const { state, heartbeatAt } = snapshot;
  // A break that was interrupted is simply over; there is nothing to credit.
  if (state.phase !== 'work') return NOTHING;
  if (state.sessionId === null || state.phaseStartedAt === null || state.dayKey === null) {
    return NOTHING;
  }

  const running = state.runningSince === null ? 0 : Math.max(0, heartbeatAt - state.runningSince);
  const rawWorked = state.accumulatedMs + running;
  if (rawWorked <= 0) return NOTHING;

  const clamped = rawWorked > MAX_RECOVERABLE_MS;
  const worked = clamped ? MAX_RECOVERABLE_MS : rawWorked;

  const pausedInProgress =
    state.pausedSince === null ? 0 : Math.max(0, heartbeatAt - state.pausedSince);
  const paused = state.pausedMs + pausedInProgress;

  // Preserve the invariant endedAt - startedAt - pausedMs === worked, even
  // after clamping, so the stored session cannot disagree with itself.
  const endedAt = state.phaseStartedAt + worked + paused;

  return {
    session: {
      id: state.sessionId,
      startedAt: state.phaseStartedAt,
      endedAt,
      source: 'pomodoro',
      distractionFree: 'unanswered',
      recovered: true,
      pausedMs: paused,
      completedFullInterval: reachedFullInterval(worked, settings),
      taskId: state.taskId,
      taskName: state.taskName,
    },
    dayKey: state.dayKey,
    clamped,
  };
}

/** Restores a snapshot only when it is safe to keep running — used for a plain
 *  reload rather than a crash. Anything older than one grace period is treated
 *  as a crash and recovered instead. */
export function resumableState(
  snapshot: TimerSnapshot | null,
  now: number,
  graceMs: number = HEARTBEAT_INTERVAL_MS * 3,
): TimerState | null {
  if (snapshot === null) return null;
  if (snapshot.state.phase === 'idle') return null;
  if (now - snapshot.heartbeatAt > graceMs) return null;
  return snapshot.state;
}

export { IDLE };
