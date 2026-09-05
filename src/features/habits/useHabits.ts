import { useCallback } from 'react';
import {
  addOfflineReport,
  addOfflineTask,
  cigaretteStreak,
  clampCigarettes,
  createOfflineReport,
  removeOfflineReport,
  removeOfflineTask,
  suggestedOfflineTask,
  updateOfflineTask,
  type DayKey,
  type OfflineReport,
  type OfflineTask,
  type StreakResult,
} from '@/domain';
import { useStore, useStoreVersion } from '@/app/storeContext';

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface HabitsView {
  readonly today: DayKey;
  readonly cigarettes: number;
  readonly cigaretteStreak: StreakResult;
  readonly excused: boolean;
  readonly isOffDay: boolean;
  readonly reports: readonly OfflineReport[];
  readonly offlineTasks: readonly OfflineTask[];
  readonly suggestedTask: OfflineTask | undefined;

  setCigarettes: (value: number) => void;
  adjustCigarettes: (delta: number) => void;
  reportOutage: (minutes: number, worked: boolean, note?: string) => void;
  deleteReport: (reportId: string) => void;
  setExcused: (dayKey: DayKey, value: boolean) => void;
  addTask: (text: string) => void;
  editTask: (taskId: string, text: string) => void;
  deleteTask: (taskId: string) => void;
}

export function useHabits(): HabitsView {
  const store = useStore();
  useStoreVersion();

  const today = store.today();
  const log = store.ensureDay(today);

  const setCigarettes = useCallback(
    (value: number) => {
      store.update(today, (current) => ({ ...current, cigarettes: clampCigarettes(value) }));
    },
    [store, today],
  );

  const adjustCigarettes = useCallback(
    (delta: number) => {
      store.update(today, (current) => ({
        ...current,
        cigarettes: clampCigarettes(current.cigarettes + delta),
      }));
    },
    [store, today],
  );

  const reportOutage = useCallback(
    (minutes: number, worked: boolean, note = '') => {
      if (minutes <= 0) return;
      const report = createOfflineReport(newId(), minutes, worked, Date.now(), note);
      store.update(today, (current) => addOfflineReport(current, report));
    },
    [store, today],
  );

  const deleteReport = useCallback(
    (reportId: string) => {
      store.update(today, (current) => removeOfflineReport(current, reportId));
    },
    [store, today],
  );

  /**
   * Takes an explicit day so the same control works from the dashboard's day
   * drill-down — the useful case is usually retroactive, marking yesterday
   * excused after the fact.
   */
  const setExcused = useCallback(
    (dayKey: DayKey, value: boolean) => {
      store.update(dayKey, (current) => ({ ...current, excused: value }));
    },
    [store],
  );

  const addTask = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed === '') return;
      store.setOfflineTasks(
        addOfflineTask(store.offlineTasks, { id: newId(), text: trimmed }, Date.now()),
      );
    },
    [store],
  );

  const editTask = useCallback(
    (taskId: string, text: string) => {
      store.setOfflineTasks(updateOfflineTask(store.offlineTasks, taskId, text, Date.now()));
    },
    [store],
  );

  const deleteTask = useCallback(
    (taskId: string) => {
      store.setOfflineTasks(removeOfflineTask(store.offlineTasks, taskId, Date.now()));
    },
    [store],
  );

  return {
    today,
    cigarettes: log.cigarettes,
    cigaretteStreak: cigaretteStreak(store.all(), today),
    excused: log.excused,
    isOffDay: log.kind === 'offday',
    reports: log.offlineReports,
    offlineTasks: store.offlineTasks.tasks,
    suggestedTask: suggestedOfflineTask(store.offlineTasks, today),

    setCigarettes,
    adjustCigarettes,
    reportOutage,
    deleteReport,
    setExcused,
    addTask,
    editTask,
    deleteTask,
  };
}
