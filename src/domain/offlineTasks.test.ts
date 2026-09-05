import { describe, expect, it } from 'vitest';
import {
  addOfflineTask,
  defaultOfflineTasks,
  removeOfflineTask,
  suggestedOfflineTask,
  updateOfflineTask,
  type OfflineTaskList,
} from './offlineTasks';
import { clampCigarettes, createOfflineReport } from './habits';

const NOW = 1_757_000_000_000;
const list = (): OfflineTaskList => defaultOfflineTasks(NOW);

describe('offline task list', () => {
  it('is seeded so it is never empty on the first outage', () => {
    expect(list().tasks.length).toBeGreaterThan(0);
  });

  it('adds a task', () => {
    const next = addOfflineTask(list(), { id: 'x', text: 'Read a paper' }, NOW);
    expect(next.tasks.at(-1)?.text).toBe('Read a paper');
  });

  it('refuses an empty task', () => {
    const original = list();
    expect(addOfflineTask(original, { id: 'x', text: '   ' }, NOW)).toBe(original);
  });

  it('edits and removes', () => {
    const edited = updateOfflineTask(list(), 'review', 'Review yesterday-s diff', NOW);
    expect(edited.tasks.find((t) => t.id === 'review')?.text).toBe('Review yesterday-s diff');

    const removed = removeOfflineTask(edited, 'review', NOW);
    expect(removed.tasks.some((t) => t.id === 'review')).toBe(false);
  });

  it('returns the same list when nothing matched', () => {
    const original = list();
    expect(updateOfflineTask(original, 'missing', 'x', NOW)).toBe(original);
    expect(removeOfflineTask(original, 'missing', NOW)).toBe(original);
  });

  it('never mutates the list it was given', () => {
    const original = list();
    const snapshot = JSON.stringify(original);
    addOfflineTask(original, { id: 'x', text: 'y' }, NOW);
    updateOfflineTask(original, 'review', 'changed', NOW);
    removeOfflineTask(original, 'review', NOW);
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe('suggestedOfflineTask', () => {
  // Stable within a day so it does not change under the user mid-outage.
  it('is the same all day', () => {
    const stable = list();
    expect(suggestedOfflineTask(stable, '2026-09-06')?.id).toBe(
      suggestedOfflineTask(stable, '2026-09-06')?.id,
    );
  });

  it('varies across days', () => {
    const days = ['2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10'];
    const picked = new Set(days.map((d) => suggestedOfflineTask(list(), d)?.id));
    expect(picked.size).toBeGreaterThan(1);
  });

  it('is undefined when the list is empty', () => {
    expect(suggestedOfflineTask({ ...list(), tasks: [] }, '2026-09-06')).toBeUndefined();
  });
});

describe('clampCigarettes', () => {
  it('floors at zero', () => {
    expect(clampCigarettes(-5)).toBe(0);
  });

  it('rejects fractions and rubbish', () => {
    expect(clampCigarettes(2.7)).toBe(2);
    expect(clampCigarettes(Number.NaN)).toBe(0);
    expect(clampCigarettes(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('createOfflineReport', () => {
  it('rounds and floors the duration', () => {
    expect(createOfflineReport('a', 90.4, true, NOW).minutes).toBe(90);
    expect(createOfflineReport('a', -30, true, NOW).minutes).toBe(0);
  });

  it('keeps worked and non-worked distinct', () => {
    expect(createOfflineReport('a', 60, true, NOW).worked).toBe(true);
    expect(createOfflineReport('b', 60, false, NOW).worked).toBe(false);
  });
});
