import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDayKey, type DayKey } from '@/domain';
import { StoreProvider } from '@/app/StoreProvider';
import { DayLogStore, MemoryAdapter } from '@/store';
import { SettingsPanel } from './SettingsPanel';

const SUNDAY = new Date(2026, 8, 6, 10, 0);
const SUNDAY_KEY: DayKey = parseDayKey('2026-09-06');

let store: DayLogStore;
let user: ReturnType<typeof userEvent.setup>;

async function renderSettings() {
  const result = render(
    <StoreProvider store={store}>
      <SettingsPanel />
    </StoreProvider>,
  );
  await screen.findByRole('region', { name: /settings/i });
  return result;
}

async function setField(name: RegExp, value: string) {
  const field = screen.getByRole('spinbutton', { name });
  await user.clear(field);
  await user.type(field, value);
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

describe('pomodoro settings', () => {
  it('starts at the documented defaults', async () => {
    await renderSettings();
    expect(screen.getByRole('spinbutton', { name: /work interval/i })).toHaveValue(25);
    expect(screen.getByRole('spinbutton', { name: /short break/i })).toHaveValue(5);
    expect(screen.getByRole('spinbutton', { name: /long break$/i })).toHaveValue(20);
    expect(screen.getByRole('spinbutton', { name: /long break every/i })).toHaveValue(4);
  });

  // Brief section 4: the interval must be adjustable, not hardcoded to 25.
  it('raises the work interval', async () => {
    await renderSettings();
    await setField(/work interval/i, '40');
    expect(store.settings.workIntervalMinutes).toBe(40);
  });

  it('clamps an out-of-range value when the field is left', async () => {
    await renderSettings();
    await setField(/work interval/i, '9999');
    await user.tab();
    expect(store.settings.workIntervalMinutes).toBe(180);
  });

  // Clearing the box must not snap it to the minimum and make the next digit
  // append to that — typing "40" has to produce 40, not 140.
  it('can be cleared and retyped', async () => {
    await renderSettings();
    const field = screen.getByRole('spinbutton', { name: /work interval/i });
    await user.clear(field);
    expect(field).toHaveValue(null);
    await user.type(field, '40');
    expect(store.settings.workIntervalMinutes).toBe(40);
  });

  it('persists across a restart', async () => {
    const adapter = new MemoryAdapter();
    store = new DayLogStore(adapter);
    await store.hydrate();

    await renderSettings();
    await setField(/work interval/i, '30');
    await store.settled();

    const reopened = new DayLogStore(adapter);
    await reopened.hydrate();
    expect(reopened.settings.workIntervalMinutes).toBe(30);
  });
});

describe('accountability settings', () => {
  it('changes the workday length in hours', async () => {
    await renderSettings();
    await setField(/workday length/i, '6');
    expect(store.settings.allocatedMinutesPerWorkday).toBe(360);
  });

  // Brief section 7: a settings change must never rewrite a day already logged.
  it('does not alter a day that already exists', async () => {
    store.ensureDay(SUNDAY_KEY);
    await renderSettings();
    await setField(/workday length/i, '6');

    expect(store.get(SUNDAY_KEY)?.allocatedMinutes).toBe(480);
  });

  it('applies to a day created afterwards', async () => {
    await renderSettings();
    await setField(/workday length/i, '6');

    const monday = store.ensureDay(parseDayKey('2026-09-07'));
    expect(monday.allocatedMinutes).toBe(360);
  });

  it('changes the streak threshold', async () => {
    await renderSettings();
    await setField(/streak threshold/i, '4');
    expect(store.settings.workStreakThresholdMinutes).toBe(240);
  });
});

describe('current project', () => {
  it('is editable', async () => {
    await renderSettings();
    const field = screen.getByRole('textbox', { name: /current project/i });
    await user.clear(field);
    await user.type(field, 'Discord clone');
    expect(store.settings.currentProject).toBe('Discord clone');
  });
});

describe('the timer honours a changed interval', () => {
  // Brief section 4: raising the interval must actually change the timer, not
  // just the stored number.
  it('uses the new interval for the long-break cadence', async () => {
    const { TimerPanel, TimerProvider } = await import('@/features/timer');
    store.updateSettings({ workIntervalMinutes: 40 });

    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(SUNDAY);
    const timerUser = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <StoreProvider store={store}>
        <TimerProvider>
          <TimerPanel />
        </TimerProvider>
      </StoreProvider>,
    );

    await timerUser.click(await screen.findByRole('button', { name: /start work/i }));
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    await timerUser.click(screen.getByRole('button', { name: /^stop$/i }));

    const logged = store.get(SUNDAY_KEY)?.workSessions[0];
    // 30 minutes is a real session, but short of the new 40-minute interval.
    expect(logged?.completedFullInterval).toBe(false);
    vi.useRealTimers();
  });
});
