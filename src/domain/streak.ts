import { MS_PER_MINUTE, WORK_STREAK_THRESHOLD_MINUTES } from './constants';
import { earliestLoggedDay } from './logIndex';
import { addDays, compareDayKeys, enumerateDays, isOffDay, type DayKey } from './time/dayKey';
import type { DayLog, DayLogIndex } from './types';
import { actualWorkedMs } from './workTime';

/**
 * `skip` days are removed from the sequence entirely rather than counted as a
 * pass or a fail — a streak runs straight through a weekend uninterrupted
 * (brief section 8).
 */
export type DayVerdict = 'pass' | 'fail' | 'skip';

export interface StreakResult {
  readonly current: number;
  readonly longest: number;
  /**
   * True when today is a workday that has not yet reached the threshold. The
   * streak is reported as intact — an in-progress day is not a failure until
   * it is over — but the UI can show it as at risk.
   */
  readonly todayPending: boolean;
}

export { earliestLoggedDay };

const EMPTY: StreakResult = { current: 0, longest: 0, todayPending: false };

export function workDayVerdict(
  dayKey: DayKey,
  log: DayLog | undefined,
  thresholdMinutes: number = WORK_STREAK_THRESHOLD_MINUTES,
): DayVerdict {
  if (isOffDay(dayKey)) return 'skip';
  if (log?.excused === true) return 'skip';
  // A workday with no log at all is a miss, not a free pass — otherwise
  // forgetting to open the app would silently protect the streak.
  if (log === undefined) return 'fail';
  return actualWorkedMs(log) >= thresholdMinutes * MS_PER_MINUTE ? 'pass' : 'fail';
}

function computeStreak(
  logs: DayLogIndex,
  today: DayKey,
  verdictOf: (dayKey: DayKey, log: DayLog | undefined) => DayVerdict,
  /**
   * Whether a failing today should be treated as unfinished rather than as a
   * break. True for work time, which accumulates over the day; false for the
   * cigarette streak, where a non-zero count is already a definitive break.
   */
  todayCanBePending: boolean,
): StreakResult {
  const earliest = earliestLoggedDay(logs);
  if (earliest === undefined || compareDayKeys(today, earliest) < 0) return EMPTY;

  let cursor = today;
  let todayPending = false;

  // An unfinished today must not read as a broken streak. If it has not yet
  // passed, start counting from yesterday and flag it as pending.
  if (todayCanBePending && verdictOf(today, logs.get(today)) === 'fail') {
    todayPending = true;
    cursor = addDays(today, -1);
  }

  let current = 0;
  while (compareDayKeys(cursor, earliest) >= 0) {
    const verdict = verdictOf(cursor, logs.get(cursor));
    if (verdict === 'skip') {
      cursor = addDays(cursor, -1);
      continue;
    }
    if (verdict === 'fail') break;
    current += 1;
    cursor = addDays(cursor, -1);
  }

  let longest = 0;
  let run = 0;
  for (const dayKey of enumerateDays(earliest, today)) {
    const verdict = verdictOf(dayKey, logs.get(dayKey));
    if (verdict === 'skip') continue;
    if (verdict === 'pass') {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }

  return { current, longest, todayPending };
}

/** Consecutive days with actual work time >= the threshold, skipping Fri/Sat
 *  and excused days. */
export function workStreak(
  logs: DayLogIndex,
  today: DayKey,
  thresholdMinutes: number = WORK_STREAK_THRESHOLD_MINUTES,
): StreakResult {
  return computeStreak(
    logs,
    today,
    (dayKey, log) => workDayVerdict(dayKey, log, thresholdMinutes),
    true,
  );
}

/**
 * Consecutive days with a cigarette count of exactly zero. Any non-zero day
 * resets to zero rather than decrementing (brief section 6.1).
 *
 * Unlike the work streak this runs over every day including Fri/Sat — quitting
 * does not take weekends off. Today counts as clean until something is logged,
 * so the streak does not appear broken each morning before first use.
 */
export function cigaretteStreak(logs: DayLogIndex, today: DayKey): StreakResult {
  return computeStreak(
    logs,
    today,
    (dayKey, log) => {
      if (log === undefined) return dayKey === today ? 'pass' : 'fail';
      return log.cigarettes === 0 ? 'pass' : 'fail';
    },
    false,
  );
}
