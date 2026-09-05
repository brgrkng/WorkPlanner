import type { BreakKind, DayKey, Settings, WorkSession } from '@/domain';
import { reachedFullInterval } from '@/domain';

export type TimerPhase = 'idle' | 'work' | 'break';

/**
 * The timer's whole state, as plain data.
 *
 * Time is never stored as a countdown that has to be ticked down — everything
 * is derived from timestamps, so the displayed value is correct no matter how
 * long the tab was frozen, backgrounded, or throttled. A ticking interval only
 * triggers re-renders; it is never the source of truth.
 */
export interface TimerState {
  readonly phase: TimerPhase;
  readonly breakKind: BreakKind | null;
  readonly sessionId: string | null;
  /** The routine block this session is being spent on. */
  readonly taskId: string | null;
  readonly taskName: string;
  /** Logical day this session belongs to, captured at start so a session that
   *  crosses the 04:00 rollover is still credited to the day it began. */
  readonly dayKey: DayKey | null;
  /** Wall-clock start of the phase; the session's `startedAt`. */
  readonly phaseStartedAt: number | null;
  /** When the current running segment began; null while paused or idle. */
  readonly runningSince: number | null;
  /** Worked time banked from earlier segments of this phase. */
  readonly accumulatedMs: number;
  /** Total time spent paused during this phase. */
  readonly pausedMs: number;
  /** When the current pause began; null when not paused. */
  readonly pausedSince: number | null;
}

export const IDLE: TimerState = {
  phase: 'idle',
  breakKind: null,
  sessionId: null,
  taskId: null,
  taskName: '',
  dayKey: null,
  phaseStartedAt: null,
  runningSince: null,
  accumulatedMs: 0,
  pausedMs: 0,
  pausedSince: null,
};

/** Worked time so far in the current phase. Excludes paused time. */
export function elapsedMs(state: TimerState, now: number): number {
  const running = state.runningSince === null ? 0 : Math.max(0, now - state.runningSince);
  return state.accumulatedMs + running;
}

/** Total time spent paused so far, including a pause still in progress. */
export function totalPausedMs(state: TimerState, now: number): number {
  const current = state.pausedSince === null ? 0 : Math.max(0, now - state.pausedSince);
  return state.pausedMs + current;
}

export function isRunning(state: TimerState): boolean {
  return state.phase !== 'idle' && state.runningSince !== null;
}

export function isPaused(state: TimerState): boolean {
  return state.phase !== 'idle' && state.pausedSince !== null;
}

/**
 * Time left in the nominal interval. Goes negative once the user works past it,
 * which the UI shows as overtime rather than stopping the session — the break
 * is a suggestion and the interface never fights the user (brief section 4).
 */
export function remainingMs(state: TimerState, now: number, targetMs: number): number {
  return targetMs - elapsedMs(state, now);
}

export interface TaskRef {
  readonly id: string | null;
  readonly name: string;
}

export function startWork(
  state: TimerState,
  now: number,
  sessionId: string,
  dayKey: DayKey,
  task: TaskRef = { id: null, name: '' },
): TimerState {
  if (state.phase === 'work') return state;
  return {
    phase: 'work',
    breakKind: null,
    sessionId,
    taskId: task.id,
    taskName: task.name,
    dayKey,
    phaseStartedAt: now,
    runningSince: now,
    accumulatedMs: 0,
    pausedMs: 0,
    pausedSince: null,
  };
}

export function startBreak(now: number, kind: BreakKind): TimerState {
  return {
    ...IDLE,
    phase: 'break',
    breakKind: kind,
    phaseStartedAt: now,
    runningSince: now,
  };
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.phase === 'idle' || state.runningSince === null) return state;
  return {
    ...state,
    accumulatedMs: elapsedMs(state, now),
    runningSince: null,
    pausedSince: now,
  };
}

export function resume(state: TimerState, now: number): TimerState {
  if (state.phase === 'idle' || state.pausedSince === null) return state;
  return {
    ...state,
    pausedMs: totalPausedMs(state, now),
    pausedSince: null,
    runningSince: now,
  };
}

export function togglePause(state: TimerState, now: number): TimerState {
  return isPaused(state) ? resume(state, now) : pause(state, now);
}

export interface StopResult {
  readonly state: TimerState;
  /** Null when the session was too short to be worth recording. */
  readonly session: WorkSession | null;
}

/**
 * Ends a work session and produces its record.
 *
 * The invariant that keeps the day's totals honest:
 *   endedAt - startedAt - pausedMs === worked time
 * so `sessionMs` reads the same number the user watched on the clock.
 */
export function stopWork(
  state: TimerState,
  now: number,
  settings: Settings,
  options: { recovered?: boolean } = {},
): StopResult {
  if (state.phase !== 'work' || state.sessionId === null || state.phaseStartedAt === null) {
    return { state: IDLE, session: null };
  }

  const worked = elapsedMs(state, now);
  const paused = totalPausedMs(state, now);

  // A session with no measurable time is noise, not data.
  if (worked <= 0) return { state: IDLE, session: null };

  return {
    state: IDLE,
    session: {
      id: state.sessionId,
      startedAt: state.phaseStartedAt,
      endedAt: now,
      source: 'pomodoro',
      distractionFree: 'unanswered',
      recovered: options.recovered ?? false,
      pausedMs: paused,
      completedFullInterval: reachedFullInterval(worked, settings),
      taskId: state.taskId,
      taskName: state.taskName,
    },
  };
}

export function endBreak(): TimerState {
  return IDLE;
}
