import { DEFAULT_ALLOCATED_MINUTES_PER_WORKDAY, MS_PER_MINUTE } from './constants';
import { earliestLoggedDay } from './logIndex';
import {
  compareDayKeys,
  enumerateDays,
  isWorkday,
  maxDayKey,
  minDayKey,
  type DayKey,
} from './time/dayKey';
import type { DayRange } from './time/ranges';
import type { DayLogIndex, DistractionAnswer } from './types';
import {
  allocatedMs,
  offlineNotWorkedMs,
  offlineWorkedMs,
  pomodoroMs,
} from './workTime';

export interface DistractionTally {
  readonly yes: number;
  readonly no: number;
  readonly unanswered: number;
}

/** All durations in milliseconds; convert at the display edge only. */
export interface PeriodTotals {
  readonly from: DayKey;
  readonly to: DayKey;
  readonly allocatedMs: number;
  readonly actualMs: number;
  readonly pomodoroMs: number;
  readonly offlineWorkedMs: number;
  readonly offlineNotWorkedMs: number;
  readonly lunchMs: number;
  readonly cigarettes: number;
  readonly distraction: DistractionTally;
  /** Workdays that contributed allocated time (excludes off days and excused). */
  readonly workdaysCounted: number;
  readonly excusedDays: number;
  readonly loggedDays: number;
  /** Workdays in range with no log at all. They still cost allocated time. */
  readonly missedDays: number;
}

const EMPTY_TOTALS = (from: DayKey, to: DayKey): PeriodTotals => ({
  from,
  to,
  allocatedMs: 0,
  actualMs: 0,
  pomodoroMs: 0,
  offlineWorkedMs: 0,
  offlineNotWorkedMs: 0,
  lunchMs: 0,
  cigarettes: 0,
  distraction: { yes: 0, no: 0, unanswered: 0 },
  workdaysCounted: 0,
  excusedDays: 0,
  loggedDays: 0,
  missedDays: 0,
});

/**
 * Aggregates stored day logs over an inclusive range.
 *
 * Three clamping rules keep the ratio meaningful:
 *
 * 1. The upper bound is clamped to `today`. A month view opened on the 3rd must
 *    not count the remaining 27 days as allocated-but-unworked.
 * 2. The lower bound is clamped to the first logged day, so days that predate
 *    the app never count against the user (SESSION.md decision 6).
 * 3. A workday inside those bounds with no log still costs its allocated hours
 *    (SESSION.md decision 7) — skipping a day has to visibly drag the ratio
 *    down, otherwise never opening the app would look like a perfect record.
 *
 * Rule 3 is the one place a current setting touches the past: an unlogged day
 * has no snapshot to read, so `defaultAllocatedMinutes` is used. Logged days
 * always use their own snapshot and are never affected by a later settings
 * change (brief section 7).
 *
 * Note that work logged on a Friday or Saturday *does* count toward actual time
 * while contributing zero allocated time — the brief excludes off days from
 * allocation only. Voluntary weekend work is real work; it can push the ratio
 * above 100%, which `overtimeMs` reports.
 */
export function periodTotals(
  logs: DayLogIndex,
  range: DayRange,
  today: DayKey,
  defaultAllocatedMinutes: number = DEFAULT_ALLOCATED_MINUTES_PER_WORKDAY,
): PeriodTotals {
  const earliest = earliestLoggedDay(logs);
  if (earliest === undefined) return EMPTY_TOTALS(range.from, minDayKey(range.to, today));

  const from = maxDayKey(range.from, earliest);
  const to = minDayKey(range.to, today);
  if (compareDayKeys(from, to) > 0) return EMPTY_TOTALS(range.from, to);

  let allocated = 0;
  let pomodoro = 0;
  let offlineWorked = 0;
  let offlineNotWorked = 0;
  let lunch = 0;
  let cigarettes = 0;
  let yes = 0;
  let no = 0;
  let unanswered = 0;
  let workdaysCounted = 0;
  let excusedDays = 0;
  let loggedDays = 0;
  let missedDays = 0;

  for (const dayKey of enumerateDays(from, to)) {
    const log = logs.get(dayKey);

    if (log === undefined) {
      if (isWorkday(dayKey)) {
        allocated += defaultAllocatedMinutes * MS_PER_MINUTE;
        workdaysCounted += 1;
        missedDays += 1;
      }
      continue;
    }

    loggedDays += 1;

    if (log.excused) {
      excusedDays += 1;
      continue;
    }

    const dayAllocated = allocatedMs(log);
    allocated += dayAllocated;
    if (dayAllocated > 0) workdaysCounted += 1;

    pomodoro += pomodoroMs(log);
    offlineWorked += offlineWorkedMs(log);
    offlineNotWorked += offlineNotWorkedMs(log);
    lunch += log.lunchMinutes * MS_PER_MINUTE;
    cigarettes += log.cigarettes;

    for (const session of log.workSessions) {
      const answer: DistractionAnswer = session.distractionFree;
      if (answer === 'yes') yes += 1;
      else if (answer === 'no') no += 1;
      else unanswered += 1;
    }
  }

  return {
    from,
    to,
    allocatedMs: allocated,
    actualMs: pomodoro + offlineWorked,
    pomodoroMs: pomodoro,
    offlineWorkedMs: offlineWorked,
    offlineNotWorkedMs: offlineNotWorked,
    lunchMs: lunch,
    cigarettes,
    distraction: { yes, no, unanswered },
    workdaysCounted,
    excusedDays,
    loggedDays,
    missedDays,
  };
}

/**
 * Actual as a fraction of allocated. Returns undefined rather than 0 or NaN
 * when nothing was allocated, so the UI can say "nothing scheduled" instead of
 * rendering a misleading empty chart.
 */
export function completionRatio(totals: PeriodTotals): number | undefined {
  if (totals.allocatedMs === 0) return undefined;
  return totals.actualMs / totals.allocatedMs;
}

/** Unused allocated time, floored at zero — overtime is not negative shortfall. */
export function shortfallMs(totals: PeriodTotals): number {
  return Math.max(0, totals.allocatedMs - totals.actualMs);
}

/** Time worked beyond what was allocated. */
export function overtimeMs(totals: PeriodTotals): number {
  return Math.max(0, totals.actualMs - totals.allocatedMs);
}

/**
 * The two slices of the allocated-vs-actual pie. They sum to the allocated
 * total on a normal day; on an overtime day `remaining` is zero and the chart
 * should show the overtime separately rather than a slice wider than the whole.
 */
export function pieSlices(totals: PeriodTotals): { worked: number; remaining: number } {
  return { worked: Math.min(totals.actualMs, totals.allocatedMs), remaining: shortfallMs(totals) };
}
