import { describe, expect, it } from 'vitest';
import { dayLog, session } from '@/test/fixtures';
import { defaultSettings, type Settings } from './index';
import {
  breakDurationMs,
  completedPomodoroCount,
  isLongBreakDue,
  nextBreakKind,
  pomodorosUntilLongBreak,
  reachedFullInterval,
  replaceSession,
} from './pomodoro';

const MIN = 60_000;
const settings: Settings = defaultSettings();

describe('reachedFullInterval', () => {
  it('is true at exactly the interval', () => {
    expect(reachedFullInterval(25 * MIN, settings)).toBe(true);
  });

  it('is false one millisecond short', () => {
    expect(reachedFullInterval(25 * MIN - 1, settings)).toBe(false);
  });

  it('follows the configured interval', () => {
    const longer: Settings = { ...settings, workIntervalMinutes: 40 };
    expect(reachedFullInterval(30 * MIN, longer)).toBe(false);
    expect(reachedFullInterval(40 * MIN, longer)).toBe(true);
  });
});

describe('completedPomodoroCount', () => {
  it('counts only sessions that ran the full interval', () => {
    const log = dayLog('2026-09-06', {
      workSessions: [
        session(25, { completedFullInterval: true }),
        session(8, { completedFullInterval: false }),
        session(30, { completedFullInterval: true }),
      ],
    });
    expect(completedPomodoroCount(log)).toBe(2);
  });

  it('is zero for a day with no log', () => {
    expect(completedPomodoroCount(undefined)).toBe(0);
  });
});

describe('long-break cadence', () => {
  // Brief section 4: a longer break after every four completed pomodoros.
  it('is due on every fourth', () => {
    const due = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => isLongBreakDue(n, 4));
    expect(due).toEqual([false, false, false, true, false, false, false, true]);
  });

  it('is not due before any pomodoro is complete', () => {
    expect(isLongBreakDue(0, 4)).toBe(false);
  });

  it('picks the break kind to suggest', () => {
    expect(nextBreakKind(3, settings)).toBe('short');
    expect(nextBreakKind(4, settings)).toBe('long');
  });

  it('counts down to the next long break', () => {
    expect(pomodorosUntilLongBreak(0, settings)).toBe(4);
    expect(pomodorosUntilLongBreak(1, settings)).toBe(3);
    expect(pomodorosUntilLongBreak(3, settings)).toBe(1);
    expect(pomodorosUntilLongBreak(4, settings)).toBe(4);
  });

  it('does not divide by zero if the cadence is disabled', () => {
    const off: Settings = { ...settings, longBreakEvery: 0 };
    expect(isLongBreakDue(4, 0)).toBe(false);
    expect(pomodorosUntilLongBreak(4, off)).toBe(0);
  });
});

describe('breakDurationMs', () => {
  it('uses the configured lengths', () => {
    expect(breakDurationMs('short', settings)).toBe(5 * MIN);
    expect(breakDurationMs('long', settings)).toBe(20 * MIN);
  });
});

describe('replaceSession', () => {
  const sessions = [session(25), session(25), session(25)];

  it('replaces only the matching session', () => {
    const target = sessions[1]!;
    const next = replaceSession(sessions, target.id, (s) => ({ ...s, distractionFree: 'yes' }));
    expect(next[0]?.distractionFree).toBe('unanswered');
    expect(next[1]?.distractionFree).toBe('yes');
    expect(next[2]?.distractionFree).toBe('unanswered');
  });

  it('returns the same array when nothing matches', () => {
    expect(replaceSession(sessions, 'missing', (s) => s)).toBe(sessions);
  });

  it('does not mutate the original', () => {
    const target = sessions[0]!;
    replaceSession(sessions, target.id, (s) => ({ ...s, distractionFree: 'no' }));
    expect(sessions[0]?.distractionFree).toBe('unanswered');
  });
});
