import { describe, expect, it } from 'vitest';
import { dayLog, index, key, offlineReport, session, workedDay } from '@/test/fixtures';
import { completionRatio, overtimeMs, periodTotals, pieSlices, shortfallMs } from './totals';
import { monthRange, weekRange } from './time/ranges';

const HOUR = 60 * 60 * 1000;

// Week of Sun 2026-09-06 .. Sat 2026-09-12:
//   five workdays (Sun-Thu) then Fri + Sat off.
const WEEK = weekRange(key('2026-09-06'));

describe('periodTotals — a single day', () => {
  it('reports 8 hours allocated against the hours actually worked', () => {
    const logs = index(workedDay('2026-09-06', 5));
    const totals = periodTotals(logs, { from: key('2026-09-06'), to: key('2026-09-06') }, key('2026-09-06'));
    expect(totals.allocatedMs).toBe(8 * HOUR);
    expect(totals.actualMs).toBe(5 * HOUR);
    expect(totals.workdaysCounted).toBe(1);
  });

  it('adds worked-offline time into actual but not into allocated', () => {
    const logs = index(
      dayLog('2026-09-06', {
        workSessions: [session(3 * 60)],
        offlineReports: [offlineReport(90, true), offlineReport(60, false)],
      }),
    );
    const totals = periodTotals(logs, { from: key('2026-09-06'), to: key('2026-09-06') }, key('2026-09-06'));
    expect(totals.pomodoroMs).toBe(3 * HOUR);
    expect(totals.offlineWorkedMs).toBe(1.5 * HOUR);
    expect(totals.offlineNotWorkedMs).toBe(1 * HOUR);
    expect(totals.actualMs).toBe(4.5 * HOUR);
    expect(totals.allocatedMs).toBe(8 * HOUR);
  });

  // Brief section 3: lunch is neither actual nor allocated.
  it('excludes lunch from both sides of the ratio', () => {
    const logs = index(workedDay('2026-09-06', 6, { lunchMinutes: 45 }));
    const totals = periodTotals(logs, { from: key('2026-09-06'), to: key('2026-09-06') }, key('2026-09-06'));
    expect(totals.actualMs).toBe(6 * HOUR);
    expect(totals.allocatedMs).toBe(8 * HOUR);
    expect(totals.lunchMs).toBe(45 * 60 * 1000);
  });
});

describe('periodTotals — a full week', () => {
  // Hand-calculated: 5 workdays x 8h = 40h allocated; Fri/Sat allocate nothing.
  // Worked 8 + 7 + 6 + 5 + 4 = 30h on workdays, plus 3h Fri and 2h Sat.
  // Weekend work is real work, so actual is 35h against 40h allocated.
  it('allocates only weekdays but counts work done on the weekend', () => {
    const logs = index(
      workedDay('2026-09-06', 8),
      workedDay('2026-09-07', 7),
      workedDay('2026-09-08', 6),
      workedDay('2026-09-09', 5),
      workedDay('2026-09-10', 4),
      workedDay('2026-09-11', 3), // Friday
      workedDay('2026-09-12', 2), // Saturday
    );
    const totals = periodTotals(logs, WEEK, key('2026-09-12'));
    expect(totals.allocatedMs).toBe(40 * HOUR);
    expect(totals.actualMs).toBe(35 * HOUR);
    expect(totals.workdaysCounted).toBe(5);
    expect(totals.missedDays).toBe(0);
    expect(completionRatio(totals)).toBeCloseTo(0.875, 10);
  });

  // SESSION.md decision 7: skipping a day has to visibly drag the ratio down,
  // otherwise never opening the app would look like a perfect record.
  it('still allocates 8 hours for a workday that was never logged', () => {
    const logs = index(
      workedDay('2026-09-06', 8),
      workedDay('2026-09-07', 8),
      workedDay('2026-09-08', 8),
      // Wed 09-09 and Thu 09-10 never logged
    );
    const totals = periodTotals(logs, WEEK, key('2026-09-12'));
    expect(totals.allocatedMs).toBe(40 * HOUR);
    expect(totals.actualMs).toBe(24 * HOUR);
    expect(totals.workdaysCounted).toBe(5);
    expect(totals.missedDays).toBe(2);
    expect(totals.loggedDays).toBe(3);
    expect(completionRatio(totals)).toBeCloseTo(0.6, 10);
  });

  // Decision 6: the app cannot judge days that predate its own existence.
  it('ignores workdays before the first logged day', () => {
    // First log is Wednesday, so Sun/Mon/Tue must not be allocated at all.
    const logs = index(workedDay('2026-09-09', 8), workedDay('2026-09-10', 8));
    const totals = periodTotals(logs, WEEK, key('2026-09-12'));
    expect(totals.from).toBe('2026-09-09');
    expect(totals.allocatedMs).toBe(16 * HOUR);
    expect(totals.missedDays).toBe(0);
    expect(completionRatio(totals)).toBe(1);
  });

  // SESSION.md decision 7: an excused day drops out of the math entirely.
  it('drops an excused day from both allocated and actual', () => {
    const logs = index(
      workedDay('2026-09-06', 8),
      workedDay('2026-09-07', 8),
      dayLog('2026-09-08', { excused: true, workSessions: [session(120)] }),
      workedDay('2026-09-09', 8),
      workedDay('2026-09-10', 8),
    );
    const totals = periodTotals(logs, WEEK, key('2026-09-12'));
    expect(totals.allocatedMs).toBe(32 * HOUR);
    expect(totals.actualMs).toBe(32 * HOUR);
    expect(totals.excusedDays).toBe(1);
    expect(totals.workdaysCounted).toBe(4);
    expect(completionRatio(totals)).toBe(1);
  });
});

describe('periodTotals — clamping to today', () => {
  // A month view opened on the 8th must not count the rest of the month as
  // allocated-but-unworked; the ratio would be meaningless.
  it('does not allocate time for days that have not happened yet', () => {
    const logs = index(
      workedDay('2026-09-06', 8),
      workedDay('2026-09-07', 8),
      workedDay('2026-09-08', 8),
    );
    const totals = periodTotals(logs, monthRange(key('2026-09-08')), key('2026-09-08'));
    expect(totals.to).toBe('2026-09-08');
    expect(totals.allocatedMs).toBe(24 * HOUR);
    expect(completionRatio(totals)).toBe(1);
  });

  it('leaves a fully past range untouched', () => {
    const logs = index(workedDay('2026-09-06', 8));
    const totals = periodTotals(logs, WEEK, key('2026-10-01'));
    expect(totals.to).toBe('2026-09-12');
  });

  it('is empty when the whole range is in the future', () => {
    const logs = index(workedDay('2026-09-06', 8));
    const totals = periodTotals(logs, weekRange(key('2026-10-04')), key('2026-09-08'));
    expect(totals.allocatedMs).toBe(0);
    expect(totals.actualMs).toBe(0);
    expect(totals.loggedDays).toBe(0);
  });
});

describe('periodTotals — habit tallies', () => {
  it('sums cigarettes across the range', () => {
    const logs = index(
      dayLog('2026-09-06', { cigarettes: 0 }),
      dayLog('2026-09-07', { cigarettes: 3 }),
      dayLog('2026-09-08', { cigarettes: 1 }),
    );
    expect(periodTotals(logs, WEEK, key('2026-09-12')).cigarettes).toBe(4);
  });

  // Brief section 6.2 / decision 8: unanswered is distinct from no.
  it('tallies the honesty check-in with unanswered kept separate', () => {
    const logs = index(
      dayLog('2026-09-06', {
        workSessions: [
          session(25, { distractionFree: 'yes' }),
          session(25, { distractionFree: 'yes' }),
          session(25, { distractionFree: 'no' }),
          session(25, { distractionFree: 'unanswered' }),
        ],
      }),
    );
    const totals = periodTotals(logs, WEEK, key('2026-09-12'));
    expect(totals.distraction).toEqual({ yes: 2, no: 1, unanswered: 1 });
  });
});

describe('ratio helpers', () => {
  // A single logged day in a single-day range: 8h allocated, `worked` actual.
  const totalsFor = (worked: number) =>
    periodTotals(
      index(workedDay('2026-09-06', worked)),
      { from: key('2026-09-06'), to: key('2026-09-06') },
      key('2026-09-06'),
    );

  it('returns undefined rather than NaN when nothing was allocated', () => {
    const totals = periodTotals(new Map(), WEEK, key('2026-09-12'));
    expect(completionRatio(totals)).toBeUndefined();
  });

  it('floors shortfall at zero on an overtime day', () => {
    const totals = totalsFor(10);
    expect(shortfallMs(totals)).toBe(0);
    expect(overtimeMs(totals)).toBe(2 * HOUR);
  });

  it('reports shortfall on an under-worked day', () => {
    const totals = totalsFor(5);
    expect(shortfallMs(totals)).toBe(3 * HOUR);
    expect(overtimeMs(totals)).toBe(0);
  });

  it('produces pie slices that sum to the allocated total', () => {
    const slices = pieSlices(totalsFor(5));
    expect(slices.worked).toBe(5 * HOUR);
    expect(slices.remaining).toBe(3 * HOUR);
  });

  // The pie must never render a slice wider than the whole chart.
  it('caps the worked slice at the allocated total on an overtime day', () => {
    const slices = pieSlices(totalsFor(10));
    expect(slices.worked).toBe(8 * HOUR);
    expect(slices.remaining).toBe(0);
  });
});
