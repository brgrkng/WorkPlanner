import { SCHEMA_VERSION } from './constants';
import type { DayLog, OfflineReport, WorkSession } from './types';
import { isDayKey, type DayKey } from './time/dayKey';
import { DEFAULT_WORK_BLOCK_IDS, type RoutineBlockSnapshot } from './routine';

/** The version that repaired work-block flags; records at or above it are trusted. */
const WORK_BLOCK_REPAIR_VERSION = 4;

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
    routine: migrateRoutine(
      Array.isArray(record.routine) ? (record.routine as RoutineBlockSnapshot[]) : [],
      numberOr(record.schemaVersion, 0),
    ),
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

/**
 * `pausedMs` and `completedFullInterval` arrived with the timer in M2;
 * `taskId` and `taskName` with task selection in M8. Sessions logged before
 * tasks existed simply have no task, which is a legitimate state.
 */
function migrateSession(session: WorkSession): WorkSession {
  return {
    ...session,
    pausedMs: numberOr(session.pausedMs, 0),
    completedFullInterval: session.completedFullInterval === true,
    taskId: typeof session.taskId === 'string' ? session.taskId : null,
    taskName: typeof session.taskName === 'string' ? session.taskName : '',
  };
}

/**
 * Repairs routine snapshots damaged by the v3 migration.
 *
 * `isWorkBlock` arrived in v3. That migration collapsed the field with
 * `isWorkBlock === true`, which turned "this record predates the flag" into a
 * hard `false` on every block — and a day with no work blocks gives the timer
 * nothing to point at, silently, forever. The information was destroyed in the
 * stored record, so v4 restores it from the one thing that survived: the block
 * ids, which are stable across renames and reordering.
 *
 * The repair is deliberately narrow. It only ever turns a flag **on**, only on
 * a day that has no work block at all, and only for an id the default routine
 * ships as work — so a day the user has genuinely configured is never touched,
 * and a block they added themselves is never assumed to be work. From v4 on,
 * whatever is stored is the truth.
 *
 * Safe against the immutability rule because `isWorkBlock` feeds no
 * accountability number: it selects which blocks the timer can be pointed at,
 * and nothing else. No streak, ratio or logged minute can move.
 */
function migrateRoutine(
  blocks: readonly RoutineBlockSnapshot[],
  storedVersion: number,
): RoutineBlockSnapshot[] {
  const normalized = blocks.map((block) => ({ ...block, isWorkBlock: block.isWorkBlock === true }));
  if (storedVersion >= WORK_BLOCK_REPAIR_VERSION) return normalized;
  if (normalized.some((block) => block.isWorkBlock)) return normalized;

  return normalized.map((block) =>
    DEFAULT_WORK_BLOCK_IDS.has(block.id) ? { ...block, isWorkBlock: true } : block,
  );
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
