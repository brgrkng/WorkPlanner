import { addDays, dayKeyToDate, weekdayOf, type DayKey } from './dayKey';

export type Granularity = 'day' | 'week' | 'month' | 'all';

/** Inclusive on both ends. */
export interface DayRange {
  readonly from: DayKey;
  readonly to: DayKey;
}

export function dayRange(key: DayKey): DayRange {
  return { from: key, to: key };
}

/**
 * Weeks run Sunday -> Saturday, matching the Sun-Thu workweek so a week view
 * contains exactly five workdays and the Fri/Sat pair at its end.
 */
export function weekRange(key: DayKey): DayRange {
  const from = addDays(key, -weekdayOf(key));
  return { from, to: addDays(from, 6) };
}

export function monthRange(key: DayKey): DayRange {
  const date = dayKeyToDate(key);
  const from = addDays(key, -(date.getDate() - 1));
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return { from, to: addDays(from, daysInMonth - 1) };
}

export function rangeFor(granularity: Granularity, key: DayKey, earliest: DayKey): DayRange {
  switch (granularity) {
    case 'day':
      return dayRange(key);
    case 'week':
      return weekRange(key);
    case 'month':
      return monthRange(key);
    case 'all':
      return { from: earliest, to: key };
  }
}
