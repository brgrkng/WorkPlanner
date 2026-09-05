import { SCHEMA_VERSION } from './constants';
import type { DayLog, OfflineReport, WorkSession } from './types';
import { isDayKey, type DayKey } from './time/dayKey';
import type { RoutineBlockSnapshot } from './routine';

/**
 * Brings a stored record up to the current shape.
 *
 * Records written by an older version of the app are missing fields added
 * since. Filling them with safe defaults is strictly better than dropping the
 * day: losing a logged day is exactly the silent data loss the app must not
 * cause. Returns null only when the record is too broken to place on a day.
 */
export function migrateDayLog(raw: unknown): DayLog | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;

  const dayKey = record.dayKey;
  if (typeof dayKey !== 'string' || !isDayKey(dayKey)) return null;

  const now = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    dayKey: dayKey as DayKey,
    kind: record.kind === 'offday' ? 'offday' : 'workday',
    excused: record.excused === true,
    allocatedMinutes: numberOr(record.allocatedMinutes, 0),
    routine: Array.isArray(record.routine) ? (record.routine as RoutineBlockSnapshot[]) : [],
    workSessions: Array.isArray(record.workSessions)
      ? (record.workSessions as WorkSession[]).map(migrateSession)
      : [],
    offlineReports: Array.isArray(record.offlineReports)
      ? (record.offlineReports as OfflineReport[])
      : [],
    lunchMinutes: numberOr(record.lunchMinutes, 0),
    cigarettes: numberOr(record.cigarettes, 0),
    sleepDebt: record.sleepDebt === true,
    note: typeof record.note === 'string' ? record.note : '',
    createdAt: numberOr(record.createdAt, now),
    updatedAt: numberOr(record.updatedAt, now),
  };
}

/** `pausedMs` and `completedFullInterval` arrived with the timer in M2. */
function migrateSession(session: WorkSession): WorkSession {
  return {
    ...session,
    pausedMs: numberOr(session.pausedMs, 0),
    completedFullInterval: session.completedFullInterval === true,
  };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
