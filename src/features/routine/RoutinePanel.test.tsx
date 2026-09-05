import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actualWorkedMs, msToRoundedMinutes, parseDayKey, type DayKey } from '@/domain';
import { StoreProvider } from '@/app/StoreProvider';
import { DayLogStore, MemoryAdapter } from '@/store';
import { TimerPanel, TimerProvider } from '@/features/timer';
import { RoutinePanel } from './RoutinePanel';
import { LUNCH_STORAGE_KEY } from './lunch';

const MIN = 60_000;
const SUNDAY = new Date(2026, 8, 6, 10, 0); // workday
const FRIDAY = new Date(2026, 8, 11, 10, 0); // off day
const SUNDAY_KEY: DayKey = parseDayKey('2026-09-06');

let store: DayLogStore;
let user: ReturnType<typeof userEvent.setup>;

/** Routine and timer together — lunch has to be able to stop a work session. */
async function renderDay() {
  const result = render(
    <StoreProvider store={store}>
      <TimerProvider>
        <RoutinePanel />
        <TimerPanel />
      </TimerProvider>
    </StoreProvider>,
  );
  await screen.findByRole('region', { name: /today/i });
  return result;
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function workedMinutes(): number {
  const log = store.get(SUNDAY_KEY);
  return log === undefined ? 0 : msToRoundedMinutes(actualWorkedMs(log));
}

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(SUNDAY);
  localStorage.clear();
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  store = new DayLogStore(new MemoryAdapter());
  await store.hydrate();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('workday view', () => {
  it('lists the routine blocks', async () => {
    await renderDay();
    // Scoped to the routine: work blocks also appear as timer task chips.
    const routine = screen.getByRole('region', { name: /today/i });
    expect(within(routine).getByText('Transition nap')).toBeInTheDocument();
    expect(within(routine).getByText('Interview prep')).toBeInTheDocument();
    expect(within(routine).getByText('Workday start')).toBeInTheDocument();
  });

  // The point of the task chips: pick what you are working on without having to
  // tick it off the checklist.
  it('keeps the checklist and the timer task selector independent', async () => {
    await renderDay();
    const routine = screen.getByRole('region', { name: /today/i });
    const timer = screen.getByRole('region', { name: /pomodoro timer/i });

    await user.click(within(timer).getByRole('button', { name: 'Project work' }));

    expect(
      within(routine).getByRole('checkbox', { name: /project work/i }),
    ).not.toBeChecked();
  });

  it('shows the fixed times', async () => {
    await renderDay();
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.getByText('18:00')).toBeInTheDocument();
  });

  it('shows the current project', async () => {
    await renderDay();
    expect(screen.getByText(/current project: trading bot/i)).toBeInTheDocument();
  });

  it('ticks off a block and remembers it', async () => {
    await renderDay();
    const checkbox = screen.getByRole('checkbox', { name: /transition nap/i });
    await user.click(checkbox);

    expect(store.get(SUNDAY_KEY)?.routine.find((b) => b.id === 'nap')?.completedAt).not.toBeNull();
  });

  it('un-ticks a block', async () => {
    await renderDay();
    const checkbox = screen.getByRole('checkbox', { name: /transition nap/i });
    await user.click(checkbox);
    await user.click(checkbox);

    expect(store.get(SUNDAY_KEY)?.routine.find((b) => b.id === 'nap')?.completedAt).toBeNull();
  });
});

describe('off-day view', () => {
  beforeEach(() => {
    vi.setSystemTime(FRIDAY);
  });

  // Brief section 2: no routine, no work block, no pressure on Fri/Sat.
  it('shows no schedule', async () => {
    await renderDay();
    expect(screen.getByText(/off day/i)).toBeInTheDocument();
    expect(screen.queryByText('Transition nap')).not.toBeInTheDocument();
    expect(screen.queryByText('Workday start')).not.toBeInTheDocument();
  });

  it('does not offer lunch or the sleep flag', async () => {
    await renderDay();
    expect(screen.queryByRole('button', { name: /start lunch/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /broken sleep/i })).not.toBeInTheDocument();
  });
});

describe('lunch', () => {
  it('pauses work accounting by ending the running session', async () => {
    await renderDay();

    await user.click(screen.getByRole('button', { name: /start work/i }));
    advance(30 * MIN);
    await user.click(screen.getByRole('button', { name: /start lunch/i }));

    // The session was closed at 30 minutes...
    expect(workedMinutes()).toBe(30);
    expect(screen.getByText(/lunch — work paused/i)).toBeInTheDocument();

    // ...and lunch time does not accrue as work.
    advance(45 * MIN);
    await user.click(screen.getByRole('button', { name: /end lunch/i }));
    expect(workedMinutes()).toBe(30);
  });

  // Brief section 3: lunch is neither actual nor allocated time.
  it('records lunch minutes separately from work', async () => {
    await renderDay();
    await user.click(screen.getByRole('button', { name: /start lunch/i }));
    advance(40 * MIN);
    await user.click(screen.getByRole('button', { name: /end lunch/i }));

    expect(store.get(SUNDAY_KEY)?.lunchMinutes).toBe(40);
    expect(workedMinutes()).toBe(0);
  });

  it('caps a long lunch at 60 minutes', async () => {
    await renderDay();
    await user.click(screen.getByRole('button', { name: /start lunch/i }));
    advance(2 * 60 * MIN);
    await user.click(screen.getByRole('button', { name: /end lunch/i }));

    expect(store.get(SUNDAY_KEY)?.lunchMinutes).toBe(60);
  });

  it('accumulates a second lunch', async () => {
    await renderDay();
    for (const minutes of [20, 15]) {
      await user.click(screen.getByRole('button', { name: /start lunch/i }));
      advance(minutes * MIN);
      await user.click(screen.getByRole('button', { name: /end lunch/i }));
    }
    expect(store.get(SUNDAY_KEY)?.lunchMinutes).toBe(35);
  });

  it('restores a lunch that was running when the app closed', async () => {
    const { unmount } = await renderDay();
    await user.click(screen.getByRole('button', { name: /start lunch/i }));
    advance(10 * MIN);
    unmount();

    await renderDay();
    expect(screen.getByText(/lunch — work paused/i)).toBeInTheDocument();

    advance(5 * MIN);
    await user.click(screen.getByRole('button', { name: /end lunch/i }));
    expect(store.get(SUNDAY_KEY)?.lunchMinutes).toBe(15);
  });

  it('discards a lunch left over from a previous day', async () => {
    localStorage.setItem(
      LUNCH_STORAGE_KEY,
      JSON.stringify({ version: 1, dayKey: '2026-09-05', startedAt: SUNDAY.getTime() }),
    );

    await renderDay();
    expect(screen.getByRole('button', { name: /start lunch/i })).toBeInTheDocument();
  });
});

describe('sleep debt self-report', () => {
  it('records the flag against today', async () => {
    await renderDay();
    await user.click(screen.getByRole('checkbox', { name: /broken sleep/i }));
    expect(store.get(SUNDAY_KEY)?.sleepDebt).toBe(true);
  });

  it('records a note', async () => {
    await renderDay();
    await user.type(screen.getByRole('textbox', { name: /note for today/i }), 'heat woke me');
    expect(store.get(SUNDAY_KEY)?.note).toBe('heat woke me');
  });
});

describe('editing the routine from the UI', () => {
  it('renames a block for future days without touching today', async () => {
    await renderDay();
    await user.click(screen.getByRole('button', { name: /edit routine/i }));

    const nameField = screen.getByRole('textbox', { name: /name of tea/i });
    await user.clear(nameField);
    await user.type(nameField, 'Coffee');

    expect(store.template.blocks.find((b) => b.id === 'tea')?.name).toBe('Coffee');
    // Today keeps the routine it was created with (brief section 7).
    expect(store.get(SUNDAY_KEY)?.routine.find((b) => b.id === 'tea')?.name).toBe('Tea');
  });

  it('tells the user that edits apply to future days', async () => {
    await renderDay();
    await user.click(screen.getByRole('button', { name: /edit routine/i }));
    expect(screen.getByText(/changes apply to future days/i)).toBeInTheDocument();
  });

  it('adds a block', async () => {
    await renderDay();
    await user.click(screen.getByRole('button', { name: /edit routine/i }));

    await user.type(screen.getByRole('textbox', { name: /new block name/i }), 'Reading');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(store.template.blocks.at(-1)?.name).toBe('Reading');
  });

  it('removes a block', async () => {
    await renderDay();
    await user.click(screen.getByRole('button', { name: /edit routine/i }));
    await user.click(screen.getByRole('button', { name: /remove gaming/i }));

    expect(store.template.blocks.some((b) => b.id === 'gaming')).toBe(false);
  });

  it('reorders blocks', async () => {
    await renderDay();
    await user.click(screen.getByRole('button', { name: /edit routine/i }));

    const idsBefore = store.template.blocks.map((b) => b.id);
    await user.click(screen.getByRole('button', { name: /move tea up/i }));

    const idsAfter = store.template.blocks.map((b) => b.id);
    expect(idsAfter.indexOf('tea')).toBe(idsBefore.indexOf('tea') - 1);
  });

  it('changes the current project', async () => {
    await renderDay();
    await user.click(screen.getByRole('button', { name: /edit routine/i }));

    const field = screen.getByLabelText(/current project/i);
    await user.clear(field);
    await user.type(field, 'Discord clone');

    expect(store.settings.currentProject).toBe('Discord clone');
  });
});

describe('block countdowns', () => {
  // Silent by design (SESSION.md decision 3): reaching zero only changes the
  // screen. Nothing here should ever produce a sound or a notification.
  it('counts down and reports done without any alert', async () => {
    await renderDay();
    await user.click(screen.getByRole('button', { name: '20 min' }));

    advance(19 * MIN);
    expect(screen.getByText('01:00')).toBeInTheDocument();

    advance(2 * MIN);
    expect(screen.getByText('done')).toBeInTheDocument();
  });

  it('resets', async () => {
    await renderDay();
    await user.click(screen.getByRole('button', { name: '20 min' }));
    advance(MIN);
    await user.click(screen.getByRole('button', { name: /reset/i }));
    expect(screen.getByRole('button', { name: '20 min' })).toBeInTheDocument();
  });
});
