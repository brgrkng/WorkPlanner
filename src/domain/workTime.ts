import { MS_PER_MINUTE } from './constants';
import type { DayLog, OfflineReport, WorkSession } from './types';

/**
 * Real worked time: the wall-clock span minus any time spent paused.
 *
 * Not the nominal interval length — a pomodoro the user let run past 25 minutes
 * accrues what it actually ran (brief section 4).
 *
 * Clamped at zero, so neither a clock adjustment mid-session nor a corrupt
 * pause total can ever subtract from the day.
 */
export function sessionMs(session: WorkSession): number {
  return Math.max(0, session.endedAt - session.startedAt - session.pausedMs);
}

export function offlineReportMs(report: OfflineReport): number {
  return Math.max(0, report.minutes) * MS_PER_MINUTE;
}

export function pomodoroMs(log: DayLog): number {
  return log.workSessions.reduce((total, session) => total + sessionMs(session), 0);
}

/** Self-reported offline work. Same bucket as pomodoro time (brief section 5). */
export function offlineWorkedMs(log: DayLog): number {
  return log.offlineReports
    .filter((report) => report.worked)
    .reduce((total, report) => total + offlineReportMs(report), 0);
}

/** Reported "didn't work" time. Tracked for honesty; contributes to nothing. */
export function offlineNotWorkedMs(log: DayLog): number {
  return log.offlineReports
    .filter((report) => !report.worked)
    .reduce((total, report) => total + offlineReportMs(report), 0);
}

/**
 * The day's actual work time: tracked sessions plus self-reported offline work.
 * Lunch is excluded by construction — starting lunch ends the running session,
 * so lunch minutes are never inside a session.
 */
export function actualWorkedMs(log: DayLog): number {
  return pomodoroMs(log) + offlineWorkedMs(log);
}

/**
 * Scheduled work time for the day. Zero for off days and for excused days,
 * which drop out of the ratio entirely (SESSION.md decision 7).
 */
export function allocatedMs(log: DayLog): number {
  if (log.excused || log.kind === 'offday') return 0;
  return log.allocatedMinutes * MS_PER_MINUTE;
}

export function msToMinutes(ms: number): number {
  return ms / MS_PER_MINUTE;
}

/** For display. Kept out of the math itself so rounding never accumulates. */
export function msToRoundedMinutes(ms: number): number {
  return Math.round(ms / MS_PER_MINUTE);
}
