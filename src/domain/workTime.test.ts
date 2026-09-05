import { describe, expect, it } from 'vitest';
import { dayLog, offlineReport, session } from '@/test/fixtures';
import {
  actualWorkedMs,
  allocatedMs,
  msToMinutes,
  offlineNotWorkedMs,
  offlineWorkedMs,
  pomodoroMs,
  sessionMs,
} from './workTime';

const MIN = 60_000;
const HOUR = 60 * MIN;

describe('sessionMs', () => {
  it('measures real elapsed time', () => {
    expect(sessionMs(session(25))).toBe(25 * MIN);
  });

  // Brief section 4: the user may keep working past the interval. The overrun
  // must be credited, not truncated to the nominal 25 minutes.
  it('credits a session that ran past its nominal interval', () => {
    expect(msToMinutes(sessionMs(session(41)))).toBe(41);
  });

  it('never returns negative time if the clock moved backwards', () => {
    const backwards = { ...session(25), startedAt: 2_000, endedAt: 1_000 };
    expect(sessionMs(backwards)).toBe(0);
  });

  it('handles a zero-length session', () => {
    expect(sessionMs(session(0))).toBe(0);
  });

  // Pausing must be honest in both directions: the real span is preserved on
  // the record, but paused time is not credited as work.
  it('excludes paused time', () => {
    const paused = session(20, { pausedMs: 30 * MIN });
    expect(paused.endedAt - paused.startedAt).toBe(50 * MIN);
    expect(sessionMs(paused)).toBe(20 * MIN);
  });

  it('never goes negative if the pause total is corrupt', () => {
    const bad = { ...session(10), pausedMs: 999 * MIN };
    expect(sessionMs(bad)).toBe(0);
  });
});

describe('pomodoroMs', () => {
  it('sums every session in the day', () => {
    const log = dayLog('2026-09-06', {
      workSessions: [session(25), session(25), session(31)],
    });
    expect(msToMinutes(pomodoroMs(log))).toBe(81);
  });

  it('is zero for a day with no sessions', () => {
    expect(pomodoroMs(dayLog('2026-09-06'))).toBe(0);
  });
});

describe('offline reports', () => {
  const log = dayLog('2026-09-06', {
    offlineReports: [
      offlineReport(90, true, 'power cut, worked on paper'),
      offlineReport(45, false, 'power cut, did not work'),
      offlineReport(30, true),
    ],
  });

  // Brief section 5: "worked offline" lands in the same bucket as pomodoro time.
  it('counts worked-offline time toward actual work', () => {
    expect(msToMinutes(offlineWorkedMs(log))).toBe(120);
  });

  it('excludes didn-not-work time from actual work', () => {
    expect(msToMinutes(offlineNotWorkedMs(log))).toBe(45);
  });

  it('ignores negative minutes', () => {
    const bad = dayLog('2026-09-06', { offlineReports: [offlineReport(-60, true)] });
    expect(offlineWorkedMs(bad)).toBe(0);
  });
});

describe('actualWorkedMs', () => {
  it('is pomodoro time plus worked-offline time', () => {
    const log = dayLog('2026-09-06', {
      workSessions: [session(120), session(60)],
      offlineReports: [offlineReport(90, true), offlineReport(120, false)],
    });
    // 2h + 1h tracked, plus 1.5h offline = 4.5h. The 2h "didn't work" is excluded.
    expect(actualWorkedMs(log)).toBe(4.5 * HOUR);
  });

  // Brief section 3: lunch counts as neither actual nor allocated time.
  it('ignores lunch entirely', () => {
    const withLunch = dayLog('2026-09-06', {
      workSessions: [session(360)],
      lunchMinutes: 60,
    });
    expect(actualWorkedMs(withLunch)).toBe(6 * HOUR);
    expect(allocatedMs(withLunch)).toBe(8 * HOUR);
  });
});

describe('allocatedMs', () => {
  it('is the snapshotted 8 hours for a workday', () => {
    expect(allocatedMs(dayLog('2026-09-06'))).toBe(8 * HOUR);
  });

  // Brief section 8: off days are never allocated time.
  it('is zero for Friday and Saturday', () => {
    expect(allocatedMs(dayLog('2026-09-11'))).toBe(0);
    expect(allocatedMs(dayLog('2026-09-12'))).toBe(0);
  });

  // SESSION.md decision 7: an excused day drops out of the ratio entirely.
  it('is zero for an excused workday', () => {
    expect(allocatedMs(dayLog('2026-09-06', { excused: true }))).toBe(0);
  });

  // Brief section 7: a later settings change must not rewrite history.
  it('uses the day-s own snapshot, not the current default', () => {
    const shortDay = dayLog('2026-09-06', { allocatedMinutes: 300 });
    expect(allocatedMs(shortDay)).toBe(5 * HOUR);
  });
});
