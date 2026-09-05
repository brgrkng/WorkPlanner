import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addBlock,
  completedBlockCount,
  isOffDay,
  moveBlock,
  msToRoundedMinutes,
  removeBlock,
  toggleBlockCompletion,
  updateBlock,
  type RoutineBlock,
  type RoutineBlockSnapshot,
  type RoutineTemplate,
} from '@/domain';
import { useStore, useStoreVersion } from '@/app/storeContext';
import { browserStorage, useTimerContext, type KeyValueStorage } from '@/features/timer';
import {
  clearLunch,
  isLunchForToday,
  lunchElapsedMs,
  readLunch,
  writeLunch,
  MAX_LUNCH_MS,
} from './lunch';

const TICK_MS = 1_000;

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `block-${Date.now()}`;
}

export interface RoutineView {
  readonly isOffDay: boolean;
  readonly routine: readonly RoutineBlockSnapshot[];
  readonly completedCount: number;
  readonly template: RoutineTemplate;
  readonly currentProject: string;
  readonly sleepDebt: boolean;
  readonly note: string;

  readonly lunchRunning: boolean;
  readonly lunchElapsedMs: number;
  readonly lunchRemainingMs: number;
  readonly lunchMinutesToday: number;

  toggleBlock: (blockId: string) => void;
  setSleepDebt: (value: boolean) => void;
  setNote: (value: string) => void;
  startLunch: () => void;
  endLunch: () => void;

  addRoutineBlock: (name: string) => void;
  editRoutineBlock: (blockId: string, patch: Partial<Omit<RoutineBlock, 'id'>>) => void;
  removeRoutineBlock: (blockId: string) => void;
  moveRoutineBlock: (blockId: string, delta: number) => void;
  setCurrentProject: (value: string) => void;
}

/**
 * Drives the routine view for today.
 *
 * Block completion is written to the day's own routine snapshot, never to the
 * template — that separation is what makes template edits forward-only (brief
 * section 7).
 */
export function useRoutine(): RoutineView {
  const store = useStore();
  useStoreVersion();
  const timer = useTimerContext();

  const today = store.today();
  const log = store.ensureDay(today);
  const offDay = isOffDay(today);

  const storageRef = useRef<KeyValueStorage | null | undefined>(undefined);
  storageRef.current ??= browserStorage();
  const storage = storageRef.current;

  const [lunchStartedAt, setLunchStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const restoredRef = useRef(false);

  // Restore a lunch that was running when the app closed. No heartbeat needed:
  // lunch has no pause, so the start instant reconstructs it exactly.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const snapshot = readLunch(storage);
    if (snapshot === null) return;
    if (isLunchForToday(snapshot, today)) setLunchStartedAt(snapshot.startedAt);
    else clearLunch(storage);
  }, [storage, today]);

  useEffect(() => {
    if (lunchStartedAt === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [lunchStartedAt]);

  const startLunch = useCallback(() => {
    const at = Date.now();
    // Brief section 3: starting lunch pauses work accounting. Ending the
    // session is what does that — lunch time then sits outside any session and
    // so counts as neither actual nor allocated time.
    timer.stop();
    setLunchStartedAt(at);
    setNow(at);
    writeLunch(storage, { version: 1, dayKey: today, startedAt: at });
  }, [storage, timer, today]);

  const endLunch = useCallback(() => {
    if (lunchStartedAt === null) return;
    const minutes = msToRoundedMinutes(lunchElapsedMs(lunchStartedAt, Date.now()));
    store.update(today, (current) => ({
      ...current,
      lunchMinutes: current.lunchMinutes + minutes,
    }));
    setLunchStartedAt(null);
    clearLunch(storage);
  }, [lunchStartedAt, storage, store, today]);

  const toggleBlock = useCallback(
    (blockId: string) => {
      const at = Date.now();
      store.update(today, (current) => ({
        ...current,
        routine: toggleBlockCompletion(current.routine, blockId, at),
      }));
    },
    [store, today],
  );

  const setSleepDebt = useCallback(
    (value: boolean) => {
      store.update(today, (current) => ({ ...current, sleepDebt: value }));
    },
    [store, today],
  );

  const setNote = useCallback(
    (value: string) => {
      store.update(today, (current) => ({ ...current, note: value }));
    },
    [store, today],
  );

  // --- template editing: affects future days only ----------------------------

  const addRoutineBlock = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (trimmed === '') return;
      store.setTemplate(
        addBlock(
          store.template,
          { id: newId(), name: trimmed, startMinute: null, durationMinutes: null, note: '' },
          Date.now(),
        ),
      );
    },
    [store],
  );

  const editRoutineBlock = useCallback(
    (blockId: string, patch: Partial<Omit<RoutineBlock, 'id'>>) => {
      store.setTemplate(updateBlock(store.template, blockId, patch, Date.now()));
    },
    [store],
  );

  const removeRoutineBlock = useCallback(
    (blockId: string) => {
      store.setTemplate(removeBlock(store.template, blockId, Date.now()));
    },
    [store],
  );

  const moveRoutineBlock = useCallback(
    (blockId: string, delta: number) => {
      store.setTemplate(moveBlock(store.template, blockId, delta, Date.now()));
    },
    [store],
  );

  const setCurrentProject = useCallback(
    (value: string) => {
      store.updateSettings({ currentProject: value });
    },
    [store],
  );

  const elapsed = lunchStartedAt === null ? 0 : lunchElapsedMs(lunchStartedAt, now);

  return {
    isOffDay: offDay,
    routine: log.routine,
    completedCount: completedBlockCount(log.routine),
    template: store.template,
    currentProject: store.settings.currentProject,
    sleepDebt: log.sleepDebt,
    note: log.note,

    lunchRunning: lunchStartedAt !== null,
    lunchElapsedMs: elapsed,
    lunchRemainingMs: MAX_LUNCH_MS - elapsed,
    lunchMinutesToday: log.lunchMinutes,

    toggleBlock,
    setSleepDebt,
    setNote,
    startLunch,
    endLunch,
    addRoutineBlock,
    editRoutineBlock,
    removeRoutineBlock,
    moveRoutineBlock,
    setCurrentProject,
  };
}
