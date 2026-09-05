import { describe, expect, it } from 'vitest';
import { key } from '@/test/fixtures';
import { enumerateDays, isWorkday } from './dayKey';
import { dayRange, monthRange, rangeFor, weekRange } from './ranges';

describe('weekRange', () => {
  // Weeks run Sunday -> Saturday so that a week contains exactly the five
  // Sun-Thu workdays followed by the Fri/Sat pair.
  it('starts on Sunday and ends on Saturday', () => {
    const range = weekRange(key('2026-09-09')); // a Wednesday
    expect(range.from).toBe('2026-09-06');
    expect(range.to).toBe('2026-09-12');
  });

  it('is stable from any day inside the week', () => {
    const expected = { from: '2026-09-06', to: '2026-09-12' };
    for (const day of enumerateDays(key('2026-09-06'), key('2026-09-12'))) {
      expect(weekRange(day)).toEqual(expected);
    }
  });

  it('contains exactly five workdays', () => {
    const range = weekRange(key('2026-09-09'));
    const workdays = enumerateDays(range.from, range.to).filter(isWorkday);
    expect(workdays).toHaveLength(5);
  });

  it('spans a month boundary', () => {
    const range = weekRange(key('2026-10-01')); // Thursday
    expect(range.from).toBe('2026-09-27');
    expect(range.to).toBe('2026-10-03');
  });
});

describe('monthRange', () => {
  it('covers the whole calendar month', () => {
    const range = monthRange(key('2026-09-15'));
    expect(range.from).toBe('2026-09-01');
    expect(range.to).toBe('2026-09-30');
  });

  it('handles a 31-day month', () => {
    expect(monthRange(key('2026-10-15')).to).toBe('2026-10-31');
  });

  it('handles February in a common year and a leap year', () => {
    expect(monthRange(key('2026-02-10')).to).toBe('2026-02-28');
    expect(monthRange(key('2024-02-10')).to).toBe('2024-02-29');
  });

  it('is stable from the first and last day of the month', () => {
    expect(monthRange(key('2026-09-01'))).toEqual(monthRange(key('2026-09-30')));
  });
});

describe('rangeFor', () => {
  const today = key('2026-09-09');
  const earliest = key('2026-08-20');

  it('returns a single day for day granularity', () => {
    expect(rangeFor('day', today, earliest)).toEqual(dayRange(today));
  });

  it('returns the containing week and month', () => {
    expect(rangeFor('week', today, earliest)).toEqual(weekRange(today));
    expect(rangeFor('month', today, earliest)).toEqual(monthRange(today));
  });

  it('runs from the earliest logged day to today for all-time', () => {
    expect(rangeFor('all', today, earliest)).toEqual({ from: earliest, to: today });
  });
});
