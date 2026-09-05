import { describe, expect, it } from 'vitest';
import { defaultSettings, parseDayKey, sessionMs, type Settings } from '@/domain';
import {
  IDLE,
  elapsedMs,
  endBreak,
  isPaused,
  isRunning,
  pause,
  remainingMs,
  resume,
  startBreak,
  startWork,
  stopWork,
  togglePause,
  totalPausedMs,
} from './timerState';

const MIN = 60_000;
const DAY = parseDayKey('2026-09-06');
const T0 = new Date(2026, 8, 6, 10, 0).getTime();
const settings: Settings = defaultSettings();

const started = () => startWork(IDLE, T0, 'session-1', DAY);

describe('startWork', () => {
  it('begins running immediately', () => {
    const state = started();
    expect(state.phase).toBe('work');
    expect(isRunning(state)).toBe(true);
    expect(isPaused(state)).toBe(false);
    expect(elapsedMs(state, T0)).toBe(0);
  });

  it('captures the logical day so a session keeps its own day', () => {
    expect(started().dayKey).toBe(DAY);
  });

  it('ignores a second start while already working', () => {
    const state = started();
    expect(startWork(state, T0 + 5 * MIN, 'session-2', DAY)).toBe(state);
  });
});

describe('elapsed time', () => {
  it('is derived from timestamps, not from ticks', () => {
    const state = started();
    // No tick ever ran; the value is still right after a 20-minute freeze.
    expect(elapsedMs(state, T0 + 20 * MIN)).toBe(20 * MIN);
  });

  it('never goes negative if the clock moves backwards', () => {
    expect(elapsedMs(started(), T0 - 5 * MIN)).toBe(0);
  });

  // Brief section 4: the user may keep working past the interval and the app
  // must not fight them. Remaining simply goes negative.
  it('reports overtime as negative remaining', () => {
    const state = started();
    expect(remainingMs(state, T0 + 25 * MIN, 25 * MIN)).toBe(0);
    expect(remainingMs(state, T0 + 41 * MIN, 25 * MIN)).toBe(-16 * MIN);
  });
});

describe('pause and resume', () => {
  it('stops accruing worked time while paused', () => {
    const paused = pause(started(), T0 + 10 * MIN);
    expect(isPaused(paused)).toBe(true);
    expect(isRunning(paused)).toBe(false);
    expect(elapsedMs(paused, T0 + 30 * MIN)).toBe(10 * MIN);
  });

  it('accrues paused time while paused', () => {
    const paused = pause(started(), T0 + 10 * MIN);
    expect(totalPausedMs(paused, T0 + 25 * MIN)).toBe(15 * MIN);
  });

  it('resumes accruing worked time', () => {
    const paused = pause(started(), T0 + 10 * MIN);
    const resumed = resume(paused, T0 + 15 * MIN);
    expect(elapsedMs(resumed, T0 + 25 * MIN)).toBe(20 * MIN);
    expect(totalPausedMs(resumed, T0 + 25 * MIN)).toBe(5 * MIN);
  });

  it('survives several pause cycles', () => {
    let state = started();
    state = pause(state, T0 + 5 * MIN);
    state = resume(state, T0 + 10 * MIN);
    state = pause(state, T0 + 15 * MIN);
    state = resume(state, T0 + 20 * MIN);
    // Worked 0-5 and 10-15 and 20-25 = 15 min; paused 5-10 and 15-20 = 10 min.
    expect(elapsedMs(state, T0 + 25 * MIN)).toBe(15 * MIN);
    expect(totalPausedMs(state, T0 + 25 * MIN)).toBe(10 * MIN);
  });

  it('ignores pause when idle and resume when running', () => {
    expect(pause(IDLE, T0)).toBe(IDLE);
    const running = started();
    expect(resume(running, T0 + MIN)).toBe(running);
  });

  it('toggles both ways', () => {
    const paused = togglePause(started(), T0 + 5 * MIN);
    expect(isPaused(paused)).toBe(true);
    expect(isRunning(togglePause(paused, T0 + 6 * MIN))).toBe(true);
  });
});

describe('stopWork', () => {
  it('records the worked time', () => {
    const { state, session } = stopWork(started(), T0 + 25 * MIN, settings);
    expect(state).toEqual(IDLE);
    expect(session).not.toBeNull();
    expect(sessionMs(session!)).toBe(25 * MIN);
  });

  // The invariant the day's totals depend on.
  it('produces a session whose duration excludes paused time', () => {
    let state = started();
    state = pause(state, T0 + 10 * MIN);
    state = resume(state, T0 + 40 * MIN); // 30 minutes away from the desk
    const { session } = stopWork(state, T0 + 50 * MIN, settings);

    expect(session!.startedAt).toBe(T0);
    expect(session!.endedAt).toBe(T0 + 50 * MIN);
    expect(session!.pausedMs).toBe(30 * MIN);
    // 50 minutes of wall clock, 20 of them worked.
    expect(sessionMs(session!)).toBe(20 * MIN);
  });

  it('closes a session that is still paused', () => {
    const state = pause(started(), T0 + 10 * MIN);
    const { session } = stopWork(state, T0 + 20 * MIN, settings);
    expect(sessionMs(session!)).toBe(10 * MIN);
    expect(session!.pausedMs).toBe(10 * MIN);
  });

  it('credits real time when the user works past the interval', () => {
    const { session } = stopWork(started(), T0 + 41 * MIN, settings);
    expect(sessionMs(session!)).toBe(41 * MIN);
    expect(session!.completedFullInterval).toBe(true);
  });

  it('marks a session stopped short of the interval as not completed', () => {
    const { session } = stopWork(started(), T0 + 8 * MIN, settings);
    expect(sessionMs(session!)).toBe(8 * MIN);
    // Still counts toward the day's work total...
    expect(session!.completedFullInterval).toBe(false);
  });

  it('marks a session at exactly the interval as completed', () => {
    const { session } = stopWork(started(), T0 + 25 * MIN, settings);
    expect(session!.completedFullInterval).toBe(true);
  });

  it('uses the interval configured at the time it ended', () => {
    const longer: Settings = { ...settings, workIntervalMinutes: 40 };
    expect(stopWork(started(), T0 + 30 * MIN, longer).session!.completedFullInterval).toBe(false);
    expect(stopWork(started(), T0 + 30 * MIN, settings).session!.completedFullInterval).toBe(true);
  });

  it('records nothing for a zero-length session', () => {
    expect(stopWork(started(), T0, settings).session).toBeNull();
  });

  it('records nothing when not working', () => {
    expect(stopWork(IDLE, T0, settings).session).toBeNull();
    expect(stopWork(startBreak(T0, 'short'), T0 + MIN, settings).session).toBeNull();
  });

  it('defaults the honesty check-in to unanswered', () => {
    const { session } = stopWork(started(), T0 + 25 * MIN, settings);
    expect(session!.distractionFree).toBe('unanswered');
  });
});

describe('breaks', () => {
  it('starts and reports its kind', () => {
    const state = startBreak(T0, 'long');
    expect(state.phase).toBe('break');
    expect(state.breakKind).toBe('long');
    expect(isRunning(state)).toBe(true);
  });

  it('tracks its own elapsed time', () => {
    expect(elapsedMs(startBreak(T0, 'short'), T0 + 3 * MIN)).toBe(3 * MIN);
  });

  // A break is a suggestion; ending it early must always be possible.
  it('can be ended at any point', () => {
    expect(endBreak()).toEqual(IDLE);
  });

  it('produces no work session', () => {
    expect(stopWork(startBreak(T0, 'short'), T0 + 5 * MIN, settings).session).toBeNull();
  });
});
