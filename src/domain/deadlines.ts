import { SCHEMA_VERSION } from './constants';
import { compareDayKeys, enumerateDays, isWorkday, parseDayKey, type DayKey } from './time/dayKey';

export interface Deadline {
  readonly id: string;
  readonly title: string;
  readonly dueDate: DayKey;
  readonly completed: boolean;
  readonly note: string;
}

export interface DeadlineList {
  readonly schemaVersion: number;
  readonly deadlines: readonly Deadline[];
  readonly updatedAt: number;
}

/**
 * Seeded with the two milestones from brief section 8. Both are fully editable
 * and removable — they are a starting point, not a fixed pair.
 */
export function defaultDeadlines(now: number): DeadlineList {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: now,
    deadlines: [
      {
        id: 'trading-bot',
        title: 'Trading bot',
        dueDate: parseDayKey('2026-09-15'),
        completed: false,
        note: '',
      },
      {
        id: 'interview-prep',
        title: 'Interview prep',
        dueDate: parseDayKey('2026-09-19'),
        completed: false,
        note: '',
      },
    ],
  };
}

export function addDeadline(list: DeadlineList, deadline: Deadline, now: number): DeadlineList {
  if (deadline.title.trim() === '') return list;
  return { ...list, deadlines: [...list.deadlines, deadline], updatedAt: now };
}

export function updateDeadline(
  list: DeadlineList,
  deadlineId: string,
  patch: Partial<Omit<Deadline, 'id'>>,
  now: number,
): DeadlineList {
  let changed = false;
  const deadlines = list.deadlines.map((deadline) => {
    if (deadline.id !== deadlineId) return deadline;
    changed = true;
    return { ...deadline, ...patch };
  });
  return changed ? { ...list, deadlines, updatedAt: now } : list;
}

export function removeDeadline(
  list: DeadlineList,
  deadlineId: string,
  now: number,
): DeadlineList {
  const deadlines = list.deadlines.filter((deadline) => deadline.id !== deadlineId);
  return deadlines.length === list.deadlines.length
    ? list
    : { ...list, deadlines, updatedAt: now };
}

/** Whole days from today to the due date. Negative once overdue, 0 on the day. */
export function daysUntil(dueDate: DayKey, today: DayKey): number {
  const direction = compareDayKeys(dueDate, today);
  if (direction === 0) return 0;
  if (direction > 0) return enumerateDays(today, dueDate).length - 1;
  return -(enumerateDays(dueDate, today).length - 1);
}

export type DeadlineStatus = 'done' | 'overdue' | 'today' | 'upcoming';

export function deadlineStatus(deadline: Deadline, today: DayKey): DeadlineStatus {
  if (deadline.completed) return 'done';
  const remaining = daysUntil(deadline.dueDate, today);
  if (remaining < 0) return 'overdue';
  if (remaining === 0) return 'today';
  return 'upcoming';
}

/** Soonest first, with completed ones moved to the end. */
export function sortDeadlines(deadlines: readonly Deadline[]): readonly Deadline[] {
  return [...deadlines].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const byDate = compareDayKeys(a.dueDate, b.dueDate);
    return byDate !== 0 ? byDate : a.title.localeCompare(b.title);
  });
}

/** How many days of the deadline's run are workdays, for a rough sense of the
 *  real time available. Excludes Fri/Sat, which have no work block. */
export function workdaysRemaining(dueDate: DayKey, today: DayKey): number {
  if (compareDayKeys(dueDate, today) < 0) return 0;
  return enumerateDays(today, dueDate).filter(isWorkday).length;
}
