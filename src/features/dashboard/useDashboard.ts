import { useCallback, useMemo, useState } from 'react';
import {
  addDeadline,
  addDays,
  cigaretteStreak,
  completionRatio,
  earliestLoggedDay,
  monthRange,
  overtimeMs,
  periodTotals,
  rangeFor,
  removeDeadline,
  shortfallMs,
  sortDeadlines,
  updateDeadline,
  workStreak,
  type DayKey,
  type DayLog,
  type Deadline,
  type DayRange,
  type Granularity,
  type PeriodTotals,
  type StreakResult,
} from '@/domain';
import { useStore, useStoreVersion } from '@/app/storeContext';

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `deadline-${Date.now()}`;
}

export interface DashboardView {
  readonly today: DayKey;
  readonly granularity: Granularity;
  readonly anchor: DayKey;
  readonly range: DayRange;
  readonly totals: PeriodTotals;
  readonly ratio: number | undefined;
  readonly shortfallMs: number;
  readonly overtimeMs: number;
  readonly workStreak: StreakResult;
  readonly cigaretteStreak: StreakResult;
  readonly cigarettesToday: number;
  readonly deadlines: readonly Deadline[];
  /** Present only in day view — the log being drilled into. */
  readonly dayLog: DayLog | undefined;
  readonly canGoForward: boolean;
  readonly canGoBack: boolean;
  readonly label: string;

  setGranularity: (granularity: Granularity) => void;
  goBack: () => void;
  goForward: () => void;
  goToToday: () => void;
  setExcused: (dayKey: DayKey, value: boolean) => void;
  createDeadline: (title: string, dueDate: DayKey) => void;
  editDeadline: (id: string, patch: Partial<Omit<Deadline, 'id'>>) => void;
  deleteDeadline: (id: string) => void;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function formatDayKey(dayKey: DayKey): string {
  const [year, month, day] = dayKey.split('-').map(Number) as [number, number, number];
  return `${day} ${MONTHS[month - 1] ?? ''} ${year}`;
}

function labelFor(granularity: Granularity, anchor: DayKey, range: DayRange): string {
  switch (granularity) {
    case 'day':
      return formatDayKey(anchor);
    case 'week':
      return `${formatDayKey(range.from)} — ${formatDayKey(range.to)}`;
    case 'month': {
      const [year, month] = anchor.split('-').map(Number) as [number, number];
      return `${MONTHS[month - 1] ?? ''} ${year}`;
    }
    case 'all':
      return 'All time';
  }
}

/** How far one step of navigation moves, per granularity. */
function step(granularity: Granularity, anchor: DayKey, direction: 1 | -1): DayKey {
  switch (granularity) {
    case 'day':
      return addDays(anchor, direction);
    case 'week':
      return addDays(anchor, 7 * direction);
    case 'month': {
      const range = monthRange(anchor);
      return direction === 1 ? addDays(range.to, 1) : addDays(range.from, -1);
    }
    case 'all':
      return anchor;
  }
}

export function useDashboard(): DashboardView {
  const store = useStore();
  useStoreVersion();

  const today = store.today();
  const [granularity, setGranularityState] = useState<Granularity>('week');
  const [anchor, setAnchor] = useState<DayKey>(today);

  const logs = store.all();
  const earliest = earliestLoggedDay(logs) ?? today;
  const range = rangeFor(granularity, anchor, earliest);

  const totals = useMemo(
    () => periodTotals(logs, range, today, store.settings.allocatedMinutesPerWorkday),
    // The store's revision (via useStoreVersion) is what actually changes; the
    // Map identity is stable because the cache is mutated in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logs, range.from, range.to, today, store.settings.allocatedMinutesPerWorkday, store.version],
  );

  const setGranularity = useCallback(
    (next: Granularity) => {
      setGranularityState(next);
      // Re-anchor to today so switching views never lands somewhere confusing.
      setAnchor(today);
    },
    [today],
  );

  const goBack = useCallback(() => {
    setAnchor((current) => step(granularity, current, -1));
  }, [granularity]);

  const goForward = useCallback(() => {
    setAnchor((current) => step(granularity, current, 1));
  }, [granularity]);

  const goToToday = useCallback(() => setAnchor(today), [today]);

  const setExcused = useCallback(
    (dayKey: DayKey, value: boolean) => {
      store.update(dayKey, (log) => ({ ...log, excused: value }));
    },
    [store],
  );

  const createDeadline = useCallback(
    (title: string, dueDate: DayKey) => {
      store.setDeadlines(
        addDeadline(
          store.deadlines,
          { id: newId(), title: title.trim(), dueDate, completed: false, note: '' },
          Date.now(),
        ),
      );
    },
    [store],
  );

  const editDeadline = useCallback(
    (id: string, patch: Partial<Omit<Deadline, 'id'>>) => {
      store.setDeadlines(updateDeadline(store.deadlines, id, patch, Date.now()));
    },
    [store],
  );

  const deleteDeadline = useCallback(
    (id: string) => {
      store.setDeadlines(removeDeadline(store.deadlines, id, Date.now()));
    },
    [store],
  );

  // Navigating past today would only ever show an empty period.
  const canGoForward = granularity !== 'all' && range.to < today;
  const canGoBack = granularity !== 'all' && range.from > earliest;

  return {
    today,
    granularity,
    anchor,
    range,
    totals,
    ratio: completionRatio(totals),
    shortfallMs: shortfallMs(totals),
    overtimeMs: overtimeMs(totals),
    workStreak: workStreak(logs, today, store.settings.workStreakThresholdMinutes),
    cigaretteStreak: cigaretteStreak(logs, today),
    cigarettesToday: store.get(today)?.cigarettes ?? 0,
    deadlines: sortDeadlines(store.deadlines.deadlines),
    dayLog: granularity === 'day' ? store.get(anchor) : undefined,
    canGoForward,
    canGoBack,
    label: labelFor(granularity, anchor, range),

    setGranularity,
    goBack,
    goForward,
    goToToday,
    setExcused,
    createDeadline,
    editDeadline,
    deleteDeadline,
  };
}
