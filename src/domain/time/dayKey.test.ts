import { describe, expect, it } from 'vitest';
import {
  addDays,
  compareDayKeys,
  dayKeyOf,
  dayStartInstant,
  enumerateDays,
  isDayKey,
  isOffDay,
  isWorkday,
  parseDayKey,
  weekdayOf,
} from './dayKey';

// 2026-09-05 is a Saturday. The week of interest:
//   Sun 2026-09-06 .. Thu 2026-09-10 are workdays
//   Fri 2026-09-11, Sat 2026-09-12 are off days
const SUNDAY = parseDayKey('2026-09-06');
const THURSDAY = parseDayKey('2026-09-10');
const FRIDAY = parseDayKey('2026-09-11');
const SATURDAY = parseDayKey('2026-09-12');

describe('parseDayKey', () => {
  it('accepts a well-formed key', () => {
    expect(parseDayKey('2026-09-06')).toBe('2026-09-06');
  });

  it.each(['2026-9-6', '26-09-06', '2026/09/06', '', 'today'])('rejects %o', (raw) => {
    expect(() => parseDayKey(raw)).toThrow(/Invalid day key/);
  });

  it('rejects a date that does not exist', () => {
    expect(() => parseDayKey('2026-02-30')).toThrow(/not a real calendar date/);
    expect(() => parseDayKey('2026-13-01')).toThrow();
  });

  it('accepts a real leap day and rejects a fake one', () => {
    expect(isDayKey('2024-02-29')).toBe(true);
    expect(isDayKey('2026-02-29')).toBe(false);
  });
});

describe('dayKeyOf — 04:00 rollover', () => {
  it('maps mid-morning to the same calendar day', () => {
    expect(dayKeyOf(new Date(2026, 8, 6, 10, 0))).toBe('2026-09-06');
  });

  it('maps late evening to the same day', () => {
    expect(dayKeyOf(new Date(2026, 8, 6, 23, 59))).toBe('2026-09-06');
  });

  // The whole point of the rollover: a session running past midnight belongs
  // to the day it started, not to the new calendar date.
  it('maps after-midnight work back to the day it started', () => {
    expect(dayKeyOf(new Date(2026, 8, 7, 0, 30))).toBe('2026-09-06');
    expect(dayKeyOf(new Date(2026, 8, 7, 3, 59))).toBe('2026-09-06');
  });

  it('rolls over at exactly 04:00', () => {
    expect(dayKeyOf(new Date(2026, 8, 7, 3, 59, 59))).toBe('2026-09-06');
    expect(dayKeyOf(new Date(2026, 8, 7, 4, 0, 0))).toBe('2026-09-07');
  });

  it('honours a custom rollover hour', () => {
    expect(dayKeyOf(new Date(2026, 8, 7, 3, 0), 0)).toBe('2026-09-07');
    expect(dayKeyOf(new Date(2026, 8, 7, 5, 0), 6)).toBe('2026-09-06');
  });

  it('crosses a month boundary correctly', () => {
    expect(dayKeyOf(new Date(2026, 9, 1, 2, 0))).toBe('2026-09-30');
  });

  it('crosses a year boundary correctly', () => {
    expect(dayKeyOf(new Date(2027, 0, 1, 1, 0))).toBe('2026-12-31');
  });
});

describe('dayStartInstant', () => {
  it('is the rollover boundary, not calendar midnight', () => {
    const start = dayStartInstant(SUNDAY);
    expect(start.getHours()).toBe(4);
    expect(start.getDate()).toBe(6);
  });

  it('round-trips: the start of a day resolves back to that day', () => {
    expect(dayKeyOf(dayStartInstant(SUNDAY))).toBe(SUNDAY);
  });
});

describe('weekday classification', () => {
  it('treats Friday and Saturday as off days', () => {
    expect(isOffDay(FRIDAY)).toBe(true);
    expect(isOffDay(SATURDAY)).toBe(true);
    expect(isWorkday(FRIDAY)).toBe(false);
    expect(isWorkday(SATURDAY)).toBe(false);
  });

  it('treats Sunday through Thursday as workdays', () => {
    for (const key of enumerateDays(SUNDAY, THURSDAY)) {
      expect(isWorkday(key)).toBe(true);
    }
  });

  it('reports Sunday as weekday 0', () => {
    expect(weekdayOf(SUNDAY)).toBe(0);
    expect(weekdayOf(SATURDAY)).toBe(6);
  });
});

describe('addDays', () => {
  it('moves forward and backward', () => {
    expect(addDays(SUNDAY, 1)).toBe('2026-09-07');
    expect(addDays(SUNDAY, -1)).toBe('2026-09-05');
  });

  it('crosses month and year boundaries', () => {
    expect(addDays(parseDayKey('2026-09-30'), 1)).toBe('2026-10-01');
    expect(addDays(parseDayKey('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addDays(parseDayKey('2027-01-01'), -1)).toBe('2026-12-31');
  });

  it('handles February in a leap year', () => {
    expect(addDays(parseDayKey('2024-02-28'), 1)).toBe('2024-02-29');
    expect(addDays(parseDayKey('2026-02-28'), 1)).toBe('2026-03-01');
  });
});

describe('enumerateDays', () => {
  it('is inclusive of both ends', () => {
    expect(enumerateDays(SUNDAY, THURSDAY)).toHaveLength(5);
  });

  it('returns a single day for a zero-width range', () => {
    expect(enumerateDays(SUNDAY, SUNDAY)).toEqual([SUNDAY]);
  });

  it('returns empty when the range is inverted', () => {
    expect(enumerateDays(THURSDAY, SUNDAY)).toEqual([]);
  });
});

describe('compareDayKeys', () => {
  it('orders chronologically', () => {
    expect(compareDayKeys(SUNDAY, THURSDAY)).toBe(-1);
    expect(compareDayKeys(THURSDAY, SUNDAY)).toBe(1);
    expect(compareDayKeys(SUNDAY, SUNDAY)).toBe(0);
  });
});
