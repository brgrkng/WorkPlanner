import { useCallback, useEffect, useRef, useState } from 'react';
import {
  breakDurationMs,
  completedPomodoroCount,
  nextBreakKind,
  pomodorosUntilLongBreak,
  replaceSession,
  type BreakKind,
  type DayKey,
  type DistractionAnswer,
  type WorkSession,
} from '@/domain';
import { MS_PER_MINUTE } from '@/domain';
import { useStore, useStoreVersion } from '@/app/storeContext';
import {
  HEARTBEAT_INTERVAL_MS,
  browserStorage,
  clearSnapshot,
  readSnapshot,
  recoverFromSnapshot,
  resumableState,
  writeSnapshot,
  type KeyValueStorage,
} from './timerPersistence';
import {
  IDLE,
  elapsedMs,
  endBreak,
  isPaused,
  isRunning,
  startBreak,
  startWork,
  stopWork,
  togglePause,
  totalPausedMs,
  type TimerState,
} from './timerState';

const TICK_MS = 1_000;

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Surfaced after a work session ends so the honesty check-in can target it. */
export interface PendingCheckIn {
  readonly sessionId: string;
  readonly dayKey: DayKey;
}

export interface TimerView {
  readonly state: TimerState;
  readonly now: number;
  readonly elapsedMs: number;
  readonly pausedMs: number;
  /** Negative once the user is working past the interval. */
  readonly remainingMs: number;
  readonly targetMs: number;
  readonly running: boolean;
  readonly paused: boolean;
  readonly completedToday: number;
  readonly untilLongBreak: number;
  readonly suggestedBreak: BreakKind;
  /** True when a break is suggested but not started. Never enforced. */
  readonly breakSuggested: boolean;
  readonly pendingCheckIn: PendingCheckIn | null;
  /** Set when a crashed session was auto-credited on startup. */
  readonly recoveredMs: number | null;

  start: () => void;
  pauseResume: () => void;
  stop: () => void;
  beginBreak: (kind?: BreakKind) => void;
  finishBreak: () => void;
  answerCheckIn: (answer: DistractionAnswer) => void;
  dismissCheckIn: () => void;
  dismissRecovery: () => void;
}

/**
 * Drives the pomodoro timer.
 *
 * Two rules shape everything here:
 *
 * 1. The state is timestamps, never a counted-down number. A tick only causes a
 *    re-render; the displayed value is recomputed from the clock, so a frozen,
 *    throttled or backgrounded tab still shows the truth when it wakes.
 * 2. A heartbeat is written synchronously to localStorage while running, so an
 *    unannounced power cut loses at most one heartbeat interval (brief
 *    section 5).
 */
export function useTimer(): TimerView {
  const store = useStore();
  useStoreVersion();

  const [state, setState] = useState<TimerState>(IDLE);
  const [now, setNow] = useState<number>(() => Date.now());
  const [pendingCheckIn, setPendingCheckIn] = useState<PendingCheckIn | null>(null);
  const [recoveredMs, setRecoveredMs] = useState<number | null>(null);

  const storageRef = useRef<KeyValueStorage | null | undefined>(undefined);
  storageRef.current ??= browserStorage();
  const storage = storageRef.current;

  const settings = store.settings;
  const recoveredRef = useRef(false);

  // --- startup recovery ------------------------------------------------------
  useEffect(() => {
    // StrictMode runs effects twice in development; recovery must happen once.
    if (recoveredRef.current) return;
    recoveredRef.current = true;

    const snapshot = readSnapshot(storage);
    if (snapshot === null) return;

    // A quick reload keeps the timer running rather than closing the session.
    const resumable = resumableState(snapshot, Date.now());
    if (resumable !== null) {
      setState(resumable);
      return;
    }

    const recovery = recoverFromSnapshot(snapshot, store.settings);
    if (recovery.session !== null && recovery.dayKey !== null) {
      const session = recovery.session;
      store.update(recovery.dayKey, (log) => ({
        ...log,
        workSessions: [...log.workSessions, session],
      }));
      setRecoveredMs(session.endedAt - session.startedAt - session.pausedMs);
    }
    clearSnapshot(storage);
  }, [store, storage]);

  // --- render tick -----------------------------------------------------------
  useEffect(() => {
    if (state.phase === 'idle') return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [state.phase, state.runningSince, state.pausedSince]);

  // --- heartbeat -------------------------------------------------------------
  useEffect(() => {
    if (state.phase === 'idle') {
      clearSnapshot(storage);
      return;
    }
    // Write immediately so a cut in the first seconds still leaves a record.
    writeSnapshot(storage, state, Date.now());
    const id = setInterval(() => writeSnapshot(storage, state, Date.now()), HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [state, storage]);

  // --- actions ---------------------------------------------------------------
  // State updaters must stay pure: React invokes them twice under StrictMode,
  // so the id is generated and the session is committed outside of them.
  const start = useCallback(() => {
    const at = Date.now();
    const id = newId();
    const dayKey = store.today();
    setNow(at);
    setPendingCheckIn(null);
    setRecoveredMs(null);
    setState((current) => startWork(current, at, id, dayKey));
  }, [store]);

  const pauseResume = useCallback(() => {
    const at = Date.now();
    setNow(at);
    setState((current) => togglePause(current, at));
  }, []);

  const commitSession = useCallback(
    (session: WorkSession, dayKey: DayKey) => {
      store.update(dayKey, (log) => ({
        ...log,
        workSessions: [...log.workSessions, session],
      }));
      setPendingCheckIn({ sessionId: session.id, dayKey });
    },
    [store],
  );

  const stop = useCallback(() => {
    const at = Date.now();
    setNow(at);
    const { state: next, session } = stopWork(state, at, store.settings);
    if (session !== null && state.dayKey !== null) commitSession(session, state.dayKey);
    setState(next);
  }, [commitSession, state, store]);

  const beginBreak = useCallback(
    (kind?: BreakKind) => {
      const at = Date.now();
      setNow(at);
      const completed = completedPomodoroCount(store.get(store.today()));
      setState(startBreak(at, kind ?? nextBreakKind(completed, store.settings)));
    },
    [store],
  );

  const finishBreak = useCallback(() => {
    setNow(Date.now());
    setState(endBreak());
  }, []);

  const answerCheckIn = useCallback(
    (answer: DistractionAnswer) => {
      if (pendingCheckIn === null) return;
      const { sessionId, dayKey } = pendingCheckIn;
      store.update(dayKey, (log) => ({
        ...log,
        workSessions: replaceSession(log.workSessions, sessionId, (session) => ({
          ...session,
          distractionFree: answer,
        })),
      }));
      setPendingCheckIn(null);
    },
    [pendingCheckIn, store],
  );

  // --- derived ---------------------------------------------------------------
  const today = store.today();
  const todayLog = store.get(today);
  const completedToday = completedPomodoroCount(todayLog);
  const suggestedBreak = nextBreakKind(completedToday, settings);

  const targetMs =
    state.phase === 'break'
      ? breakDurationMs(state.breakKind ?? 'short', settings)
      : settings.workIntervalMinutes * MS_PER_MINUTE;

  const elapsed = state.phase === 'idle' ? 0 : elapsedMs(state, now);

  return {
    state,
    now,
    elapsedMs: elapsed,
    pausedMs: state.phase === 'idle' ? 0 : totalPausedMs(state, now),
    remainingMs: targetMs - elapsed,
    targetMs,
    running: isRunning(state),
    paused: isPaused(state),
    completedToday,
    untilLongBreak: pomodorosUntilLongBreak(completedToday, settings),
    suggestedBreak,
    breakSuggested: state.phase === 'idle' && pendingCheckIn !== null,
    pendingCheckIn,
    recoveredMs,
    start,
    pauseResume,
    stop,
    beginBreak,
    finishBreak,
    answerCheckIn,
    dismissCheckIn: () => setPendingCheckIn(null),
    dismissRecovery: () => setRecoveredMs(null),
  };
}
