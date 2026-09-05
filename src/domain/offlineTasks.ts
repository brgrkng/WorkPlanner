import { SCHEMA_VERSION } from './constants';

/**
 * A fallback task the user can do with no power or internet.
 *
 * Deliberately a plain list the user maintains themselves rather than anything
 * fetched or generated — brief section 5 asks for simplicity over cleverness
 * here, and anything fetched live would be useless in the exact situation the
 * list exists for.
 */
export interface OfflineTask {
  readonly id: string;
  readonly text: string;
}

export interface OfflineTaskList {
  readonly schemaVersion: number;
  readonly tasks: readonly OfflineTask[];
  readonly updatedAt: number;
}

/** Seeded with the examples from brief section 5 so the list is never empty on
 *  the first outage. All of them are editable. */
export function defaultOfflineTasks(now: number): OfflineTaskList {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: now,
    tasks: [
      { id: 'leetcode', text: 'Work through a pre-saved Leetcode problem on paper' },
      { id: 'review', text: 'Review code already written, offline' },
      { id: 'architecture', text: 'Sketch architecture or notes by hand' },
    ],
  };
}

export function addOfflineTask(
  list: OfflineTaskList,
  task: OfflineTask,
  now: number,
): OfflineTaskList {
  if (task.text.trim() === '') return list;
  return { ...list, tasks: [...list.tasks, task], updatedAt: now };
}

export function updateOfflineTask(
  list: OfflineTaskList,
  taskId: string,
  text: string,
  now: number,
): OfflineTaskList {
  let changed = false;
  const tasks = list.tasks.map((task) => {
    if (task.id !== taskId) return task;
    changed = true;
    return { ...task, text };
  });
  return changed ? { ...list, tasks, updatedAt: now } : list;
}

export function removeOfflineTask(
  list: OfflineTaskList,
  taskId: string,
  now: number,
): OfflineTaskList {
  const tasks = list.tasks.filter((task) => task.id !== taskId);
  return tasks.length === list.tasks.length ? list : { ...list, tasks, updatedAt: now };
}

/**
 * The task to surface right now. Rotates by day so the same item is not always
 * the one staring at the user, but is stable within a day so it does not change
 * under them mid-outage.
 */
export function suggestedOfflineTask(
  list: OfflineTaskList,
  dayKey: string,
): OfflineTask | undefined {
  if (list.tasks.length === 0) return undefined;
  let hash = 0;
  for (const character of dayKey) hash = (hash * 31 + character.charCodeAt(0)) % 100_000;
  return list.tasks[hash % list.tasks.length];
}
