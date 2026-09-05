import { ROLLOVER_HOUR } from '../constants';

declare const dayKeyBrand: unique symbol;

/**
 * A logical calendar day, 'YYYY-MM-DD' in local time.
 *
 * Branded so a raw string can never be passed where a validated day key is
 * expected — day-bucketing bugs are exactly the kind of silent corruption the
 * accountability numbers cannot tolerate. Build one with `dayKeyOf` (from an
 * instant) or `parseDayKey` (from stored text). Never construct by hand.
 */
export type DayKey = string & { readonly [dayKeyBrand]: true };

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatLocal(date: Date): DayKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` as DayKey;
}

/**
 * The logical day an instant belongs to.
 *
 * Applies the rollover shift: with the default 04:00 boundary, 2026-09-06
 * 01:30 (a late work session) resolves to 2026-09-05, the day it started.
 */
export function dayKeyOf(instant: Date, rolloverHour: number = ROLLOVER_HOUR): DayKey {
  const shifted = new Date(instant.getTime());
  shifted.setHours(shifted.getHours() - rolloverHour);
  return formatLocal(shifted);
}

/** Validates stored text. Throws rather than silently producing a bad key. */
export function parseDayKey(raw: string): DayKey {
  if (!DAY_KEY_PATTERN.test(raw)) {
    throw new Error(`Invalid day key: ${JSON.stringify(raw)} (expected YYYY-MM-DD)`);
  }
  const [y, m, d] = raw.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    throw new Error(`Invalid day key: ${raw} is not a real calendar date`);
  }
  return raw as DayKey;
}

export function isDayKey(raw: string): raw is DayKey {
  try {
    parseDayKey(raw);
    return true;
  } catch {
    return false;
  }
}

/** Local midnight of the key's calendar date. Not the rollover boundary — use
 *  only for weekday/arithmetic purposes. */
export function dayKeyToDate(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/** The instant a logical day begins (its rollover boundary). */
export function dayStartInstant(key: DayKey, rolloverHour: number = ROLLOVER_HOUR): Date {
  const date = dayKeyToDate(key);
  date.setHours(rolloverHour, 0, 0, 0);
  return date;
}

export function addDays(key: DayKey, delta: number): DayKey {
  const date = dayKeyToDate(key);
  date.setDate(date.getDate() + delta);
  return formatLocal(date);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(key: DayKey): number {
  return dayKeyToDate(key).getDay();
}

const FRIDAY = 5;
const SATURDAY = 6;

/** Friday and Saturday are off days: no routine, no work block, and excluded
 *  from streak logic entirely (brief sections 2 and 8). */
export function isOffDay(key: DayKey): boolean {
  const day = weekdayOf(key);
  return day === FRIDAY || day === SATURDAY;
}

/** Sunday through Thursday. */
export function isWorkday(key: DayKey): boolean {
  return !isOffDay(key);
}

/** ISO day keys sort lexicographically, which is what makes this safe. */
export function compareDayKeys(a: DayKey, b: DayKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDayKey(a: DayKey, b: DayKey): DayKey {
  return a <= b ? a : b;
}

export function maxDayKey(a: DayKey, b: DayKey): DayKey {
  return a >= b ? a : b;
}

/** Inclusive range. Returns empty when `to` precedes `from`. */
export function enumerateDays(from: DayKey, to: DayKey): DayKey[] {
  const days: DayKey[] = [];
  let cursor = from;
  while (cursor <= to) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}
