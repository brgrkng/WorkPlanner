import {
  DEFAULT_ALLOCATED_MINUTES_PER_WORKDAY,
  DEFAULT_LONG_BREAK_EVERY,
  DEFAULT_LONG_BREAK_MINUTES,
  DEFAULT_SHORT_BREAK_MINUTES,
  DEFAULT_WORK_INTERVAL_MINUTES,
  ROLLOVER_HOUR,
  SCHEMA_VERSION,
  WORK_STREAK_THRESHOLD_MINUTES,
} from './constants';
import { defaultRoutineTemplate, snapshotRoutine, type RoutineTemplate } from './routine';
import { isOffDay, type DayKey } from './time/dayKey';
import type { DayLog, Settings } from './types';

export function defaultSettings(): Settings {
  return {
    schemaVersion: SCHEMA_VERSION,
    workIntervalMinutes: DEFAULT_WORK_INTERVAL_MINUTES,
    shortBreakMinutes: DEFAULT_SHORT_BREAK_MINUTES,
    longBreakMinutes: DEFAULT_LONG_BREAK_MINUTES,
    longBreakEvery: DEFAULT_LONG_BREAK_EVERY,
    allocatedMinutesPerWorkday: DEFAULT_ALLOCATED_MINUTES_PER_WORKDAY,
    workStreakThresholdMinutes: WORK_STREAK_THRESHOLD_MINUTES,
    rolloverHour: ROLLOVER_HOUR,
    currentProject: 'Trading bot',
    updatedAt: 0,
  };
}

/**
 * Creates a day's record, snapshotting the allocated workday length at creation
 * time. A later settings change must not alter this day (brief section 7),
 * which is why allocation is copied in rather than looked up when reading.
 */
export interface CreateDayLogOptions {
  readonly allocatedMinutesPerWorkday?: number;
  /** Snapshotted into the day. Off days get no routine — the brief says they
   *  must not show the workday schedule at all (section 2). */
  readonly template?: RoutineTemplate;
}

export function createDayLog(
  dayKey: DayKey,
  now: number,
  options: CreateDayLogOptions = {},
): DayLog {
  const offday = isOffDay(dayKey);
  const allocatedMinutesPerWorkday =
    options.allocatedMinutesPerWorkday ?? DEFAULT_ALLOCATED_MINUTES_PER_WORKDAY;
  const template = options.template ?? defaultRoutineTemplate(now);

  return {
    schemaVersion: SCHEMA_VERSION,
    dayKey,
    kind: offday ? 'offday' : 'workday',
    excused: false,
    allocatedMinutes: offday ? 0 : allocatedMinutesPerWorkday,
    routine: offday ? [] : snapshotRoutine(template),
    workSessions: [],
    offlineReports: [],
    lunchMinutes: 0,
    cigarettes: 0,
    sleepDebt: false,
    note: '',
    createdAt: now,
    updatedAt: now,
  };
}
