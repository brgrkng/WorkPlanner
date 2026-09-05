import {
  createDayLog,
  parseDayKey,
  type DayKey,
  type DayLog,
  type DistractionAnswer,
  type OfflineReport,
  type WorkSession,
} from '@/domain';

/** Fixed reference instant so tests never depend on the real clock. */
export const NOW = new Date(2026, 8, 6, 10, 0).getTime();

export function key(raw: string): DayKey {
  return parseDayKey(raw);
}

let sessionCounter = 0;

/** A work session of an exact duration. Start time is irrelevant to the math
 *  (only the delta is used), so it defaults to the reference instant. */
export function session(
  minutes: number,
  options: {
    distractionFree?: DistractionAnswer;
    startedAt?: number;
    recovered?: boolean;
    source?: WorkSession['source'];
  } = {},
): WorkSession {
  const startedAt = options.startedAt ?? NOW;
  return {
    id: `session-${(sessionCounter += 1)}`,
    startedAt,
    endedAt: startedAt + minutes * 60_000,
    source: options.source ?? 'pomodoro',
    distractionFree: options.distractionFree ?? 'unanswered',
    recovered: options.recovered ?? false,
  };
}

let reportCounter = 0;

export function offlineReport(minutes: number, worked: boolean, note = ''): OfflineReport {
  return {
    id: `report-${(reportCounter += 1)}`,
    startedAt: NOW,
    minutes,
    worked,
    note,
  };
}

/**
 * A day log with overrides applied. `kind` and `allocatedMinutes` come from the
 * real factory so that off days are correctly zero-allocated by default.
 */
export function dayLog(raw: string, overrides: Partial<DayLog> = {}): DayLog {
  return { ...createDayLog(key(raw), NOW), ...overrides };
}

/** A workday with a given number of hours of tracked pomodoro work. */
export function workedDay(raw: string, hours: number, overrides: Partial<DayLog> = {}): DayLog {
  return dayLog(raw, { workSessions: [session(hours * 60)], ...overrides });
}

export function index(...logs: DayLog[]): Map<DayKey, DayLog> {
  return new Map(logs.map((log) => [log.dayKey, log]));
}
