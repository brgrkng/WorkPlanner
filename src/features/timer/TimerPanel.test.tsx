import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actualWorkedMs, msToRoundedMinutes, parseDayKey, type DayKey } from '@/domain';
import { StoreProvider } from '@/app/StoreProvider';
import { DayLogStore, MemoryAdapter } from '@/store';
import { TimerPanel } from './TimerPanel';
import { TimerProvider } from './TimerProvider';
import { TIMER_STORAGE_KEY, type TimerSnapshot } from './timerPersistence';
import { IDLE } from './timerState';

const MIN = 60_000;
const START = new Date(2026, 8, 6, 10, 0);
const TODAY: DayKey = parseDayKey('2026-09-06');

let store: DayLogStore;
let user: ReturnType<typeof userEvent.setup>;

async function renderPanel() {
  const result = render(
    <StoreProvider store={store}>
      <TimerProvider>
        <TimerPanel />
      </TimerProvider>
    </StoreProvider>,
  );
  await screen.findByRole('button', { name: /start work/i });
  return result;
}

/** Advances both the fake clock and the timer's interval callbacks. */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** Rounded: userEvent's simulated click delay adds a few real milliseconds to
 *  each session, which is genuine elapsed time but noise at this granularity. */
function workedMinutesToday(): number {
  const log = store.get(TODAY);
  return log === undefined ? 0 : msToRoundedMinutes(actualWorkedMs(log));
}

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(START);
  localStorage.clear();
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  store = new DayLogStore(new MemoryAdapter());
  await store.hydrate();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('running a session', () => {
  it('counts a completed pomodoro toward the day', async () => {
    await renderPanel();

    await user.click(screen.getByRole('button', { name: /start work/i }));
    expect(screen.getByText(/working/i)).toBeInTheDocument();

    advance(25 * MIN);
    await user.click(screen.getByRole('button', { name: /^stop$/i }));

    expect(workedMinutesToday()).toBe(25);
  });

  // Brief section 4: strict about starting, flexible about stopping.
  it('keeps running past the interval and credits the real elapsed time', async () => {
    await renderPanel();
    await user.click(screen.getByRole('button', { name: /start work/i }));

    advance(41 * MIN);
    // The app must not have stopped itself.
    expect(screen.getByText(/overtime/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^stop$/i }));
    expect(workedMinutesToday()).toBe(41);
  });

  it('excludes paused time from the day total', async () => {
    await renderPanel();
    await user.click(screen.getByRole('button', { name: /start work/i }));

    advance(10 * MIN);
    await user.click(screen.getByRole('button', { name: /pause/i }));
    expect(screen.getByText(/paused/i)).toBeInTheDocument();

    advance(30 * MIN); // away from the desk
    await user.click(screen.getByRole('button', { name: /resume/i }));
    advance(10 * MIN);
    await user.click(screen.getByRole('button', { name: /^stop$/i }));

    expect(workedMinutesToday()).toBe(20);
  });

  it('accumulates several sessions across the day', async () => {
    await renderPanel();

    for (const minutes of [25, 25, 10]) {
      await user.click(screen.getByRole('button', { name: /start work|back to work/i }));
      advance(minutes * MIN);
      await user.click(screen.getByRole('button', { name: /^stop$/i }));
    }

    expect(workedMinutesToday()).toBe(60);
  });
});

describe('break cadence', () => {
  async function completePomodoros(count: number) {
    for (let i = 0; i < count; i += 1) {
      await user.click(screen.getByRole('button', { name: /start work|back to work/i }));
      advance(25 * MIN);
      await user.click(screen.getByRole('button', { name: /^stop$/i }));
    }
  }

  it('suggests a short break after one pomodoro', async () => {
    await renderPanel();
    await completePomodoros(1);
    expect(screen.getByRole('button', { name: /take a short break/i })).toBeInTheDocument();
  });

  // Brief section 4: a longer break after every four completed pomodoros.
  it('suggests a long break after the fourth', async () => {
    await renderPanel();
    await completePomodoros(4);
    expect(screen.getByRole('button', { name: /take a long break/i })).toBeInTheDocument();
  });

  it('does not count a session stopped short of the interval', async () => {
    await renderPanel();
    await completePomodoros(3);

    await user.click(screen.getByRole('button', { name: /start work|back to work/i }));
    advance(5 * MIN);
    await user.click(screen.getByRole('button', { name: /^stop$/i }));

    // Four sessions, but only three full ones: still a short break.
    expect(screen.getByRole('button', { name: /take a short break/i })).toBeInTheDocument();
    // The five minutes are still credited as work.
    expect(workedMinutesToday()).toBe(80);
  });

  // The break must never trap the user.
  it('lets the user skip the break and start working again', async () => {
    await renderPanel();
    await completePomodoros(1);

    await user.click(screen.getByRole('button', { name: /start work|back to work/i }));
    expect(screen.getByText(/working/i)).toBeInTheDocument();
  });

  it('lets the user end a break early', async () => {
    await renderPanel();
    await completePomodoros(1);

    await user.click(screen.getByRole('button', { name: /take a short break/i }));
    expect(screen.getByText(/short break/i)).toBeInTheDocument();

    advance(30_000);
    await user.click(screen.getByRole('button', { name: /end break/i }));
    expect(screen.getByRole('button', { name: /start work/i })).toBeInTheDocument();
  });

  it('does not credit break time as work', async () => {
    await renderPanel();
    await completePomodoros(1);

    await user.click(screen.getByRole('button', { name: /take a short break/i }));
    advance(5 * MIN);
    await user.click(screen.getByRole('button', { name: /end break/i }));

    expect(workedMinutesToday()).toBe(25);
  });
});

describe('honesty check-in', () => {
  async function onePomodoro() {
    await user.click(screen.getByRole('button', { name: /start work/i }));
    advance(25 * MIN);
    await user.click(screen.getByRole('button', { name: /^stop$/i }));
  }

  it('asks after a session ends', async () => {
    await renderPanel();
    await onePomodoro();
    expect(screen.getByText(/stayed off youtube/i)).toBeInTheDocument();
  });

  it('records the answer against that session', async () => {
    await renderPanel();
    await onePomodoro();

    await user.click(screen.getByRole('button', { name: /^yes$/i }));
    expect(store.get(TODAY)?.workSessions[0]?.distractionFree).toBe('yes');
  });

  it('records a no', async () => {
    await renderPanel();
    await onePomodoro();

    await user.click(screen.getByRole('button', { name: /^no$/i }));
    expect(store.get(TODAY)?.workSessions[0]?.distractionFree).toBe('no');
  });

  // Decision 8: non-blocking, and silence is not a failure.
  it('leaves an ignored check-in as unanswered, not as a no', async () => {
    await renderPanel();
    await onePomodoro();

    await user.click(screen.getByRole('button', { name: /skip/i }));
    expect(store.get(TODAY)?.workSessions[0]?.distractionFree).toBe('unanswered');
  });

  it('never blocks the next session', async () => {
    await renderPanel();
    await onePomodoro();

    // Check-in still on screen; starting work must still be possible.
    expect(screen.getByText(/stayed off youtube/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /start work/i }));
    expect(screen.getByText(/working/i)).toBeInTheDocument();
  });
});

describe('power-cut recovery', () => {
  /** Writes the heartbeat a crashed session would have left behind. */
  function crashedSnapshot(workedMs: number): void {
    const startedAt = START.getTime();
    const snapshot: TimerSnapshot = {
      version: 1,
      state: {
        ...IDLE,
        phase: 'work',
        sessionId: 'crashed-session',
        dayKey: TODAY,
        phaseStartedAt: startedAt,
        runningSince: startedAt,
      },
      heartbeatAt: startedAt + workedMs,
    };
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(snapshot));
  }

  // The scenario the whole design is for: working at 10:00, power dies at
  // 10:18, machine off for an hour, app reopened at 11:20.
  it('auto-credits the interrupted session on next launch', async () => {
    crashedSnapshot(18 * MIN);
    vi.setSystemTime(new Date(2026, 8, 6, 11, 20));

    await renderPanel();

    await waitFor(() => expect(workedMinutesToday()).toBe(18));
    expect(screen.getByText(/recovered 18 min/i)).toBeInTheDocument();
  });

  it('credits time to the last heartbeat, not to the moment of reopening', async () => {
    crashedSnapshot(18 * MIN);
    // Reopened four hours later; the extra hours were not worked.
    vi.setSystemTime(new Date(2026, 8, 6, 14, 0));

    await renderPanel();
    await waitFor(() => expect(workedMinutesToday()).toBe(18));
  });

  it('marks the recovered session as recovered', async () => {
    crashedSnapshot(18 * MIN);
    vi.setSystemTime(new Date(2026, 8, 6, 11, 20));

    await renderPanel();
    await waitFor(() => expect(store.get(TODAY)?.workSessions).toHaveLength(1));
    expect(store.get(TODAY)?.workSessions[0]?.recovered).toBe(true);
  });

  it('clears the snapshot so the same session cannot be credited twice', async () => {
    crashedSnapshot(18 * MIN);
    vi.setSystemTime(new Date(2026, 8, 6, 11, 20));

    const { unmount } = await renderPanel();
    await waitFor(() => expect(workedMinutesToday()).toBe(18));
    unmount();

    await renderPanel();
    expect(workedMinutesToday()).toBe(18);
  });

  it('starts clean when there is no snapshot', async () => {
    await renderPanel();
    expect(workedMinutesToday()).toBe(0);
    expect(screen.queryByText(/recovered/i)).not.toBeInTheDocument();
  });

  it('adds recovered time to work done earlier the same day', async () => {
    const { unmount } = await renderPanel();
    await user.click(screen.getByRole('button', { name: /start work/i }));
    advance(25 * MIN);
    await user.click(screen.getByRole('button', { name: /^stop$/i }));
    expect(workedMinutesToday()).toBe(25);

    // The power cuts during a later session; the app reopens on the same day.
    unmount();
    crashedSnapshot(18 * MIN);
    await renderPanel();
    await waitFor(() => expect(workedMinutesToday()).toBe(43));
  });
});

describe('heartbeat', () => {
  it('writes a snapshot while running and clears it on stop', async () => {
    await renderPanel();
    await user.click(screen.getByRole('button', { name: /start work/i }));

    advance(10_000);
    expect(localStorage.getItem(TIMER_STORAGE_KEY)).not.toBeNull();

    await user.click(screen.getByRole('button', { name: /^stop$/i }));
    expect(localStorage.getItem(TIMER_STORAGE_KEY)).toBeNull();
  });
});
