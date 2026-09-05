import { MS_PER_MINUTE } from './constants';
import type { DayLog, Settings, WorkSession } from './types';

export type BreakKind = 'short' | 'long';

/**
 * Pomodoros that ran the full configured interval. Sessions stopped early still
 * count toward the day's work total, but do not advance the long-break cadence
 * — four two-minute starts are not four pomodoros.
 */
export function completedPomodoroCount(log: DayLog | undefined): number {
  if (log === undefined) return 0;
  return log.workSessions.filter((session) => session.completedFullInterval).length;
}

/** Whether a session that just ended earned its "completed" flag. */
export function reachedFullInterval(workedMs: number, settings: Settings): boolean {
  return workedMs >= settings.workIntervalMinutes * MS_PER_MINUTE;
}

/** A long break is due after every 4th completed pomodoro (brief section 4). */
export function isLongBreakDue(completedCount: number, longBreakEvery: number): boolean {
  return completedCount > 0 && longBreakEvery > 0 && completedCount % longBreakEvery === 0;
}

export function nextBreakKind(completedCount: number, settings: Settings): BreakKind {
  return isLongBreakDue(completedCount, settings.longBreakEvery) ? 'long' : 'short';
}

export function breakDurationMs(kind: BreakKind, settings: Settings): number {
  const minutes = kind === 'long' ? settings.longBreakMinutes : settings.shortBreakMinutes;
  return minutes * MS_PER_MINUTE;
}

/**
 * How many completed pomodoros remain before the next long break. Purely
 * informational — the break is a suggestion and is never enforced.
 */
export function pomodorosUntilLongBreak(completedCount: number, settings: Settings): number {
  const every = settings.longBreakEvery;
  if (every <= 0) return 0;
  return every - (completedCount % every);
}

/** Replaces one session in a day's log, for answering the honesty check-in
 *  after the fact. Returns the same array when nothing matched. */
export function replaceSession(
  sessions: readonly WorkSession[],
  sessionId: string,
  update: (session: WorkSession) => WorkSession,
): readonly WorkSession[] {
  let changed = false;
  const next = sessions.map((session) => {
    if (session.id !== sessionId) return session;
    changed = true;
    return update(session);
  });
  return changed ? next : sessions;
}
