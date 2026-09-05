import { describe, expect, it } from 'vitest';
import {
  addDeadline,
  daysUntil,
  deadlineStatus,
  defaultDeadlines,
  removeDeadline,
  sortDeadlines,
  updateDeadline,
  workdaysRemaining,
  type Deadline,
} from './deadlines';
import { parseDayKey } from './time/dayKey';

const NOW = 1_757_000_000_000;
const key = parseDayKey;
// Thu 2026-09-10.
const TODAY = key('2026-09-10');

const list = () => defaultDeadlines(NOW);
const deadline = (id: string, due: string, completed = false): Deadline => ({
  id,
  title: id,
  dueDate: key(due),
  completed,
  note: '',
});

describe('default deadlines', () => {
  // Brief section 8 seeds these two; both are editable and removable.
  it('seeds the trading bot and interview prep milestones', () => {
    const ids = list().deadlines.map((d) => d.id);
    expect(ids).toContain('trading-bot');
    expect(ids).toContain('interview-prep');
  });

  it('uses the dates from the brief', () => {
    const byId = new Map(list().deadlines.map((d) => [d.id, d.dueDate]));
    expect(byId.get('trading-bot')).toBe('2026-09-15');
    expect(byId.get('interview-prep')).toBe('2026-09-19');
  });
});

describe('daysUntil', () => {
  it('is zero on the day itself', () => {
    expect(daysUntil(TODAY, TODAY)).toBe(0);
  });

  it('counts forward', () => {
    expect(daysUntil(key('2026-09-15'), TODAY)).toBe(5);
  });

  it('goes negative once overdue', () => {
    expect(daysUntil(key('2026-09-01'), TODAY)).toBe(-9);
  });

  it('crosses a month boundary', () => {
    expect(daysUntil(key('2026-10-01'), TODAY)).toBe(21);
  });
});

describe('workdaysRemaining', () => {
  // Thu 10 -> Tue 15: 10, 13, 14, 15 are workdays; 11 and 12 are Fri/Sat.
  it('excludes Friday and Saturday', () => {
    expect(workdaysRemaining(key('2026-09-15'), TODAY)).toBe(4);
  });

  it('is one on the due date itself', () => {
    expect(workdaysRemaining(TODAY, TODAY)).toBe(1);
  });

  it('is zero once overdue', () => {
    expect(workdaysRemaining(key('2026-09-01'), TODAY)).toBe(0);
  });
});

describe('deadlineStatus', () => {
  it('classifies each state', () => {
    expect(deadlineStatus(deadline('a', '2026-09-20'), TODAY)).toBe('upcoming');
    expect(deadlineStatus(deadline('b', '2026-09-10'), TODAY)).toBe('today');
    expect(deadlineStatus(deadline('c', '2026-09-01'), TODAY)).toBe('overdue');
  });

  it('reports a completed deadline as done even when overdue', () => {
    expect(deadlineStatus(deadline('d', '2026-09-01', true), TODAY)).toBe('done');
  });
});

describe('editing', () => {
  it('adds, updates and removes', () => {
    const added = addDeadline(list(), deadline('extra', '2026-10-01'), NOW);
    expect(added.deadlines).toHaveLength(3);

    const renamed = updateDeadline(added, 'extra', { title: 'Fitness tracker' }, NOW);
    expect(renamed.deadlines.find((d) => d.id === 'extra')?.title).toBe('Fitness tracker');

    expect(removeDeadline(renamed, 'extra', NOW).deadlines).toHaveLength(2);
  });

  it('refuses an untitled deadline', () => {
    const original = list();
    expect(addDeadline(original, { ...deadline('x', '2026-10-01'), title: '  ' }, NOW)).toBe(
      original,
    );
  });

  it('never mutates the list it was given', () => {
    const original = list();
    const snapshot = JSON.stringify(original);
    addDeadline(original, deadline('x', '2026-10-01'), NOW);
    updateDeadline(original, 'trading-bot', { title: 'x' }, NOW);
    removeDeadline(original, 'trading-bot', NOW);
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe('sortDeadlines', () => {
  it('puts the soonest first', () => {
    const sorted = sortDeadlines([
      deadline('late', '2026-10-01'),
      deadline('soon', '2026-09-12'),
    ]);
    expect(sorted.map((d) => d.id)).toEqual(['soon', 'late']);
  });

  it('moves completed ones to the end regardless of date', () => {
    const sorted = sortDeadlines([
      deadline('done-early', '2026-09-11', true),
      deadline('open-late', '2026-10-01'),
    ]);
    expect(sorted.map((d) => d.id)).toEqual(['open-late', 'done-early']);
  });

  it('does not mutate the input', () => {
    const input = [deadline('b', '2026-10-01'), deadline('a', '2026-09-11')];
    sortDeadlines(input);
    expect(input[0]?.id).toBe('b');
  });
});
