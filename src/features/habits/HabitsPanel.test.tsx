import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  actualWorkedMs,
  cigaretteStreak,
  msToRoundedMinutes,
  parseDayKey,
  periodTotals,
  workStreak,
  type DayKey,
} from '@/domain';
import { StoreProvider } from '@/app/StoreProvider';
import { DayLogStore, MemoryAdapter } from '@/store';
import { HabitsPanel } from './HabitsPanel';

const SUNDAY = new Date(2026, 8, 6, 10, 0);
const SUNDAY_KEY: DayKey = parseDayKey('2026-09-06');
const SATURDAY = new Date(2026, 8, 12, 10, 0);

let store: DayLogStore;
let user: ReturnType<typeof userEvent.setup>;

async function renderPanel() {
  const result = render(
    <StoreProvider store={store}>
      <HabitsPanel />
    </StoreProvider>,
  );
  await screen.findByRole('region', { name: /habits and outages/i });
  return result;
}

function workedMinutes(): number {
  const log = store.get(SUNDAY_KEY);
  return log === undefined ? 0 : msToRoundedMinutes(actualWorkedMs(log));
}

beforeEach(async () => {
  vi.setSystemTime(SUNDAY);
  store = new DayLogStore(new MemoryAdapter());
  await store.hydrate();
  user = userEvent.setup();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cigarette counter', () => {
  it('starts at zero', async () => {
    await renderPanel();
    expect(screen.getByRole('spinbutton', { name: /cigarettes today/i })).toHaveValue(0);
  });

  it('increments and decrements', async () => {
    await renderPanel();
    await user.click(screen.getByRole('button', { name: /one more cigarette/i }));
    await user.click(screen.getByRole('button', { name: /one more cigarette/i }));
    expect(store.get(SUNDAY_KEY)?.cigarettes).toBe(2);

    await user.click(screen.getByRole('button', { name: /one fewer cigarette/i }));
    expect(store.get(SUNDAY_KEY)?.cigarettes).toBe(1);
  });

  it('cannot go below zero', async () => {
    await renderPanel();
    expect(screen.getByRole('button', { name: /one fewer cigarette/i })).toBeDisabled();
    expect(store.get(SUNDAY_KEY)?.cigarettes).toBe(0);
  });

  it('accepts a typed value', async () => {
    await renderPanel();
    const field = screen.getByRole('spinbutton', { name: /cigarettes today/i });
    await user.clear(field);
    await user.type(field, '3');
    expect(store.get(SUNDAY_KEY)?.cigarettes).toBe(3);
  });

  // Brief section 6.1: purely a logging feature, no interventions.
  it('shows no intervention prompt when the count rises', async () => {
    await renderPanel();
    for (let i = 0; i < 5; i += 1) {
      await user.click(screen.getByRole('button', { name: /one more cigarette/i }));
    }
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/are you sure|try|avoid|instead/i)).not.toBeInTheDocument();
  });

  it('shows the clean streak', async () => {
    store.update(parseDayKey('2026-09-04'), (log) => ({ ...log, cigarettes: 0 }));
    store.update(parseDayKey('2026-09-05'), (log) => ({ ...log, cigarettes: 0 }));
    await renderPanel();

    // Two clean days plus an unlogged-but-clean today.
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('resets the streak display when today is not clean', async () => {
    store.update(parseDayKey('2026-09-04'), (log) => ({ ...log, cigarettes: 0 }));
    store.update(parseDayKey('2026-09-05'), (log) => ({ ...log, cigarettes: 0 }));
    await renderPanel();

    await user.click(screen.getByRole('button', { name: /one more cigarette/i }));
    expect(cigaretteStreak(store.all(), SUNDAY_KEY).current).toBe(0);
    // The best run is still remembered.
    expect(screen.getByText(/best 2/i)).toBeInTheDocument();
  });
});

describe('outage self-report', () => {
  // Brief section 5: worked-offline time lands in the same bucket as pomodoros.
  it('counts a worked-offline stretch toward the day', async () => {
    await renderPanel();

    const minutes = screen.getByRole('spinbutton', { name: /minutes offline/i });
    await user.clear(minutes);
    await user.type(minutes, '90');
    await user.click(screen.getByRole('button', { name: /worked offline/i }));

    expect(workedMinutes()).toBe(90);
  });

  it('does not count a non-working stretch', async () => {
    await renderPanel();
    await user.click(screen.getByRole('button', { name: /didn't work/i }));

    expect(workedMinutes()).toBe(0);
    expect(store.get(SUNDAY_KEY)?.offlineReports).toHaveLength(1);
  });

  // Brief section 5: no shaming, no punitive framing.
  it('reports a non-working stretch without any warning styling', async () => {
    await renderPanel();
    await user.click(screen.getByRole('button', { name: /didn't work/i }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(/60 min not worked/i)).toBeInTheDocument();
  });

  it('records an optional note', async () => {
    await renderPanel();
    await user.type(screen.getByRole('textbox', { name: /outage note/i }), 'grid down');
    await user.click(screen.getByRole('button', { name: /worked offline/i }));

    expect(store.get(SUNDAY_KEY)?.offlineReports[0]?.note).toBe('grid down');
  });

  it('accumulates several reports', async () => {
    await renderPanel();
    await user.click(screen.getByRole('button', { name: /worked offline/i }));
    await user.click(screen.getByRole('button', { name: /didn't work/i }));

    expect(store.get(SUNDAY_KEY)?.offlineReports).toHaveLength(2);
    expect(workedMinutes()).toBe(60);
  });

  it('removes a report', async () => {
    await renderPanel();
    await user.click(screen.getByRole('button', { name: /worked offline/i }));
    await user.click(screen.getByRole('button', { name: /remove 60 minute report/i }));

    expect(store.get(SUNDAY_KEY)?.offlineReports).toHaveLength(0);
    expect(workedMinutes()).toBe(0);
  });

  it('ignores a zero-length report', async () => {
    await renderPanel();
    const minutes = screen.getByRole('spinbutton', { name: /minutes offline/i });
    await user.clear(minutes);
    await user.type(minutes, '0');
    await user.click(screen.getByRole('button', { name: /worked offline/i }));

    expect(store.get(SUNDAY_KEY)?.offlineReports).toHaveLength(0);
  });
});

describe('offline fallback tasks', () => {
  it('always suggests something without being opened', async () => {
    await renderPanel();
    expect(screen.getByText(/if the power goes:/i)).toBeInTheDocument();
  });

  it('lists the seeded tasks when expanded', async () => {
    await renderPanel();
    await user.click(screen.getByRole('button', { name: /offline fallback tasks/i }));
    expect(screen.getByDisplayValue(/pre-saved leetcode problem/i)).toBeInTheDocument();
  });

  it('adds a task', async () => {
    await renderPanel();
    await user.click(screen.getByRole('button', { name: /offline fallback tasks/i }));

    await user.type(screen.getByRole('textbox', { name: /new offline task/i }), 'Read a paper');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(store.offlineTasks.tasks.at(-1)?.text).toBe('Read a paper');
  });

  it('removes a task', async () => {
    await renderPanel();
    await user.click(screen.getByRole('button', { name: /offline fallback tasks/i }));

    const before = store.offlineTasks.tasks.length;
    await user.click(screen.getByRole('button', { name: /remove offline task: review code/i }));
    expect(store.offlineTasks.tasks).toHaveLength(before - 1);
  });

  it('persists the list across a restart', async () => {
    const adapter = new MemoryAdapter();
    store = new DayLogStore(adapter);
    await store.hydrate();

    await renderPanel();
    await user.click(screen.getByRole('button', { name: /offline fallback tasks/i }));
    await user.type(screen.getByRole('textbox', { name: /new offline task/i }), 'Plan the week');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await store.settled();

    const reopened = new DayLogStore(adapter);
    await reopened.hydrate();
    expect(reopened.offlineTasks.tasks.at(-1)?.text).toBe('Plan the week');
  });
});

describe('excused days', () => {
  it('marks today excused', async () => {
    await renderPanel();
    await user.click(screen.getByRole('checkbox', { name: /excuse today/i }));
    expect(store.get(SUNDAY_KEY)?.excused).toBe(true);
  });

  // Decisions 6 and 7: an excused day is skipped by streaks and drops out of
  // the allocated-vs-actual math entirely.
  it('makes the day neutral for the streak', async () => {
    store.update(parseDayKey('2026-09-03'), (log) => ({
      ...log,
      workSessions: [
        {
          id: 'a',
          startedAt: 0,
          endedAt: 8 * 60 * 60_000,
          source: 'pomodoro',
          distractionFree: 'yes',
          recovered: false,
          pausedMs: 0,
          completedFullInterval: true,
          taskId: null,
          taskName: '',
        },
      ],
    }));

    await renderPanel();
    // Today has no work: without excusing, the streak would be at risk.
    await user.click(screen.getByRole('checkbox', { name: /excuse today/i }));

    const streak = workStreak(store.all(), SUNDAY_KEY);
    expect(streak.current).toBe(1);
    expect(streak.todayPending).toBe(false);
  });

  it('removes the day from allocated time', async () => {
    await renderPanel();
    await user.click(screen.getByRole('checkbox', { name: /excuse today/i }));

    const totals = periodTotals(
      store.all(),
      { from: SUNDAY_KEY, to: SUNDAY_KEY },
      SUNDAY_KEY,
    );
    expect(totals.allocatedMs).toBe(0);
    expect(totals.excusedDays).toBe(1);
  });

  it('can be un-excused', async () => {
    await renderPanel();
    const checkbox = screen.getByRole('checkbox', { name: /excuse today/i });
    await user.click(checkbox);
    await user.click(checkbox);
    expect(store.get(SUNDAY_KEY)?.excused).toBe(false);
  });

  // Off days are already neutral; excusing them would be meaningless.
  it('is not offered on an off day', async () => {
    vi.setSystemTime(SATURDAY);
    store = new DayLogStore(new MemoryAdapter());
    await store.hydrate();

    await renderPanel();
    expect(screen.queryByRole('checkbox', { name: /excuse today/i })).not.toBeInTheDocument();
  });
});
