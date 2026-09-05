import { describe, expect, it } from 'vitest';
import { dayLog, index, key, offlineReport, session, workedDay } from '@/test/fixtures';
import { cigaretteStreak, earliestLoggedDay, workDayVerdict, workStreak } from './streak';

// Calendar under test (all 2026):
//   Sun 09-06  Mon 09-07  Tue 09-08  Wed 09-09  Thu 09-10   <- workdays
//   Fri 09-11  Sat 09-12                                    <- off days
//   Sun 09-13  Mon 09-14  Tue 09-15  Wed 09-16  Thu 09-17   <- workdays

describe('workDayVerdict', () => {
  it('passes a workday at exactly the 6-hour threshold', () => {
    expect(workDayVerdict(key('2026-09-06'), workedDay('2026-09-06', 6))).toBe('pass');
  });

  it('fails a workday one minute short of the threshold', () => {
    const shy = dayLog('2026-09-06', { workSessions: [session(6 * 60 - 1)] });
    expect(workDayVerdict(key('2026-09-06'), shy)).toBe('fail');
  });

  it('skips Friday and Saturday regardless of hours worked', () => {
    expect(workDayVerdict(key('2026-09-11'), undefined)).toBe('skip');
    expect(workDayVerdict(key('2026-09-12'), workedDay('2026-09-12', 9))).toBe('skip');
  });

  it('skips an excused workday', () => {
    expect(workDayVerdict(key('2026-09-06'), dayLog('2026-09-06', { excused: true }))).toBe('skip');
  });

  // SESSION.md decision 6: forgetting to open the app must not protect a streak.
  it('fails a workday with no log at all', () => {
    expect(workDayVerdict(key('2026-09-06'), undefined)).toBe('fail');
  });

  it('counts worked-offline time toward the threshold', () => {
    const log = dayLog('2026-09-07', {
      workSessions: [session(4 * 60)],
      offlineReports: [offlineReport(120, true)],
    });
    expect(workDayVerdict(key('2026-09-07'), log)).toBe('pass');
  });

  it('does not count reported non-work time toward the threshold', () => {
    const log = dayLog('2026-09-07', {
      workSessions: [session(4 * 60)],
      offlineReports: [offlineReport(120, false)],
    });
    expect(workDayVerdict(key('2026-09-07'), log)).toBe('fail');
  });
});

describe('workStreak', () => {
  it('is zero with no logs at all', () => {
    expect(workStreak(new Map(), key('2026-09-10'))).toEqual({
      current: 0,
      longest: 0,
      todayPending: false,
    });
  });

  it('counts consecutive passing workdays', () => {
    const logs = index(
      workedDay('2026-09-06', 8),
      workedDay('2026-09-07', 7),
      workedDay('2026-09-08', 6),
    );
    expect(workStreak(logs, key('2026-09-08')).current).toBe(3);
  });

  // Brief section 8: the weekend is skipped, not treated as a pass or a fail.
  // A streak must run straight through it uninterrupted.
  it('runs through Friday and Saturday uninterrupted', () => {
    const logs = index(
      workedDay('2026-09-09', 8),
      workedDay('2026-09-10', 8),
      // Fri 09-11 and Sat 09-12 have no logs at all
      workedDay('2026-09-13', 8),
      workedDay('2026-09-14', 8),
    );
    expect(workStreak(logs, key('2026-09-14')).current).toBe(4);
  });

  it('is not extended by logging hours on a Friday or Saturday', () => {
    const logs = index(
      workedDay('2026-09-10', 8),
      workedDay('2026-09-11', 8), // Friday - must not count
      workedDay('2026-09-12', 8), // Saturday - must not count
      workedDay('2026-09-13', 8),
    );
    expect(workStreak(logs, key('2026-09-13')).current).toBe(2);
  });

  it('is broken by a workday under six hours', () => {
    const logs = index(
      workedDay('2026-09-06', 8),
      workedDay('2026-09-07', 3),
      workedDay('2026-09-08', 8),
    );
    expect(workStreak(logs, key('2026-09-08')).current).toBe(1);
  });

  it('is broken by a missing workday in the middle', () => {
    const logs = index(
      workedDay('2026-09-06', 8),
      // Mon 09-07 never logged
      workedDay('2026-09-08', 8),
      workedDay('2026-09-09', 8),
    );
    expect(workStreak(logs, key('2026-09-09')).current).toBe(2);
  });

  // SESSION.md decision 6: an excused day is skipped exactly like a weekend.
  it('runs through an excused day', () => {
    const logs = index(
      workedDay('2026-09-06', 8),
      dayLog('2026-09-07', { excused: true }),
      workedDay('2026-09-08', 8),
    );
    expect(workStreak(logs, key('2026-09-08')).current).toBe(2);
  });

  // The streak begins at the first logged day, so pre-app history is neutral.
  it('is not broken by workdays before the first logged day', () => {
    const logs = index(workedDay('2026-09-09', 8), workedDay('2026-09-10', 8));
    expect(workStreak(logs, key('2026-09-10')).current).toBe(2);
  });

  it('resets to zero rather than decrementing', () => {
    const logs = index(
      workedDay('2026-09-06', 8),
      workedDay('2026-09-07', 8),
      workedDay('2026-09-08', 8),
      workedDay('2026-09-09', 1),
    );
    // Today (09-09) is short, so it is pending rather than a break; the streak
    // shown is the three completed days behind it.
    const result = workStreak(logs, key('2026-09-09'));
    expect(result.current).toBe(3);
    expect(result.todayPending).toBe(true);

    // Once that day is in the past it is a definitive break: nothing carries over.
    expect(workStreak(logs, key('2026-09-10')).current).toBe(0);
  });

  describe('today in progress', () => {
    it('does not treat an unfinished today as a break', () => {
      const logs = index(
        workedDay('2026-09-06', 8),
        workedDay('2026-09-07', 8),
        workedDay('2026-09-08', 0.5),
      );
      const result = workStreak(logs, key('2026-09-08'));
      expect(result.current).toBe(2);
      expect(result.todayPending).toBe(true);
    });

    it('includes today once it crosses the threshold', () => {
      const logs = index(
        workedDay('2026-09-06', 8),
        workedDay('2026-09-07', 8),
        workedDay('2026-09-08', 6),
      );
      const result = workStreak(logs, key('2026-09-08'));
      expect(result.current).toBe(3);
      expect(result.todayPending).toBe(false);
    });

    it('is not pending when today is an off day', () => {
      const logs = index(workedDay('2026-09-09', 8), workedDay('2026-09-10', 8));
      const result = workStreak(logs, key('2026-09-11'));
      expect(result.current).toBe(2);
      expect(result.todayPending).toBe(false);
    });
  });

  describe('longest', () => {
    it('remembers a longer past run after a break', () => {
      const logs = index(
        workedDay('2026-09-06', 8),
        workedDay('2026-09-07', 8),
        workedDay('2026-09-08', 8),
        workedDay('2026-09-09', 1), // break
        workedDay('2026-09-10', 8),
      );
      const result = workStreak(logs, key('2026-09-10'));
      expect(result.current).toBe(1);
      expect(result.longest).toBe(3);
    });

    it('is never less than the current streak', () => {
      const logs = index(workedDay('2026-09-06', 8), workedDay('2026-09-07', 8));
      const result = workStreak(logs, key('2026-09-07'));
      expect(result.longest).toBeGreaterThanOrEqual(result.current);
    });
  });

  it('honours a custom threshold', () => {
    const logs = index(workedDay('2026-09-06', 4), workedDay('2026-09-07', 4));
    expect(workStreak(logs, key('2026-09-07'), 4 * 60).current).toBe(2);
    expect(workStreak(logs, key('2026-09-07'), 6 * 60).current).toBe(0);
  });
});

describe('cigaretteStreak', () => {
  // Brief section 6.1: the streak holds only on a day with a count of exactly 0.
  it('counts consecutive zero days', () => {
    const logs = index(
      dayLog('2026-09-06', { cigarettes: 0 }),
      dayLog('2026-09-07', { cigarettes: 0 }),
      dayLog('2026-09-08', { cigarettes: 0 }),
    );
    expect(cigaretteStreak(logs, key('2026-09-08')).current).toBe(3);
  });

  it('resets to zero on any non-zero day, however small', () => {
    const logs = index(
      dayLog('2026-09-06', { cigarettes: 0 }),
      dayLog('2026-09-07', { cigarettes: 0 }),
      dayLog('2026-09-08', { cigarettes: 1 }),
    );
    expect(cigaretteStreak(logs, key('2026-09-08')).current).toBe(0);
  });

  // Unlike the work streak, quitting does not take weekends off.
  it('includes Friday and Saturday', () => {
    const logs = index(
      dayLog('2026-09-10', { cigarettes: 0 }),
      dayLog('2026-09-11', { cigarettes: 2 }), // Friday still breaks it
      dayLog('2026-09-12', { cigarettes: 0 }),
      dayLog('2026-09-13', { cigarettes: 0 }),
    );
    expect(cigaretteStreak(logs, key('2026-09-13')).current).toBe(2);
  });

  // Without this the streak would read as broken every morning before first use.
  it('treats an unlogged today as still clean', () => {
    const logs = index(
      dayLog('2026-09-06', { cigarettes: 0 }),
      dayLog('2026-09-07', { cigarettes: 0 }),
    );
    expect(cigaretteStreak(logs, key('2026-09-08')).current).toBe(3);
  });

  it('breaks on an unlogged past day', () => {
    const logs = index(
      dayLog('2026-09-06', { cigarettes: 0 }),
      // 09-07 never logged
      dayLog('2026-09-08', { cigarettes: 0 }),
    );
    expect(cigaretteStreak(logs, key('2026-09-08')).current).toBe(1);
  });

  it('tracks the longest clean run', () => {
    const logs = index(
      dayLog('2026-09-06', { cigarettes: 0 }),
      dayLog('2026-09-07', { cigarettes: 0 }),
      dayLog('2026-09-08', { cigarettes: 0 }),
      dayLog('2026-09-09', { cigarettes: 4 }),
      dayLog('2026-09-10', { cigarettes: 0 }),
    );
    const result = cigaretteStreak(logs, key('2026-09-10'));
    expect(result.current).toBe(1);
    expect(result.longest).toBe(3);
  });
});

describe('earliestLoggedDay', () => {
  it('finds the earliest key regardless of insertion order', () => {
    const logs = index(workedDay('2026-09-10', 8), workedDay('2026-09-06', 8));
    expect(earliestLoggedDay(logs)).toBe('2026-09-06');
  });

  it('is undefined for an empty index', () => {
    expect(earliestLoggedDay(new Map())).toBeUndefined();
  });
});
