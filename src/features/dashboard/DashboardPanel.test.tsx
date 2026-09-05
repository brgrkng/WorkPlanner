import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDayKey, type DayKey, type WorkSession } from '@/domain';
import { StoreProvider } from '@/app/StoreProvider';
import { DayLogStore, MemoryAdapter } from '@/store';
import { DashboardPanel } from './DashboardPanel';

// Anchor: Thursday 2026-09-10. The surrounding calendar:
//   Sun 09-06  Mon 09-07  Tue 09-08  Wed 09-09  Thu 09-10   workdays
//   Fri 09-11  Sat 09-12                                     off days
const TODAY = new Date(2026, 8, 10, 18, 0);
const key = (raw: string): DayKey => parseDayKey(raw);

let store: DayLogStore;
let user: ReturnType<typeof userEvent.setup>;

function session(hours: number, distractionFree: WorkSession['distractionFree'] = 'yes'): WorkSession {
  return {
    id: `s-${Math.random()}`,
    startedAt: 0,
    endedAt: hours * 60 * 60_000,
    source: 'pomodoro',
    distractionFree,
    recovered: false,
    pausedMs: 0,
    completedFullInterval: true,
  };
}

function logWork(day: string, hours: number) {
  store.update(key(day), (log) => ({ ...log, workSessions: [session(hours)] }));
}

async function renderDashboard() {
  const result = render(
    <StoreProvider store={store}>
      <DashboardPanel />
    </StoreProvider>,
  );
  await screen.findByRole('region', { name: /dashboard/i });
  return result;
}

/** Reads one value from the always-visible numeric breakdown. */
function breakdown(label: string): string {
  const term = screen.getByText(label);
  const value = term.parentElement?.querySelector('dd');
  return value?.textContent ?? '';
}

beforeEach(async () => {
  vi.setSystemTime(TODAY);
  store = new DayLogStore(new MemoryAdapter());
  await store.hydrate();
  user = userEvent.setup();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('week view — hand-calculated', () => {
  // Worked 8 + 7 + 6 + 5 + 4 = 30h across Sun-Thu.
  // Allocated: 5 workdays x 8h = 40h. Ratio 30/40 = 75%.
  beforeEach(() => {
    logWork('2026-09-06', 8);
    logWork('2026-09-07', 7);
    logWork('2026-09-08', 6);
    logWork('2026-09-09', 5);
    logWork('2026-09-10', 4);
  });

  it('shows 30h actual against 40h allocated', async () => {
    await renderDashboard();
    expect(breakdown('Allocated')).toBe('40h');
    expect(breakdown('Actual')).toBe('30h');
  });

  it('shows the ratio as 75%', async () => {
    await renderDashboard();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('shows the hero figure in hours', async () => {
    await renderDashboard();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('counts five workdays and no missed days', async () => {
    await renderDashboard();
    expect(breakdown('Workdays')).toBe('5');
    expect(breakdown('Missed')).toBe('0');
  });
});

describe('day view — hand-calculated', () => {
  it('shows one day of 8 hours against 8 allocated', async () => {
    logWork('2026-09-10', 8);
    await renderDashboard();
    await user.click(screen.getByRole('tab', { name: 'Day' }));

    expect(breakdown('Allocated')).toBe('8h');
    expect(breakdown('Actual')).toBe('8h');
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('shows a partial day', async () => {
    logWork('2026-09-10', 5.5);
    await renderDashboard();
    await user.click(screen.getByRole('tab', { name: 'Day' }));

    expect(breakdown('Actual')).toBe('5h 30m');
    expect(screen.getByText('69%')).toBeInTheDocument();
  });

  it('drills into the day-s sessions', async () => {
    logWork('2026-09-10', 3);
    await renderDashboard();
    await user.click(screen.getByRole('tab', { name: 'Day' }));

    expect(screen.getByText('3h worked')).toBeInTheDocument();
  });
});

describe('month view — hand-calculated', () => {
  // Only Sun-Thu of one week logged; the month range is clamped to today
  // (Thu 09-10) and to the first logged day, so allocated is exactly 40h.
  it('clamps the month to today and the first logged day', async () => {
    logWork('2026-09-06', 8);
    logWork('2026-09-07', 8);
    logWork('2026-09-08', 8);
    logWork('2026-09-09', 8);
    logWork('2026-09-10', 8);

    await renderDashboard();
    await user.click(screen.getByRole('tab', { name: 'Month' }));

    expect(breakdown('Allocated')).toBe('40h');
    expect(breakdown('Actual')).toBe('40h');
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('counts a skipped workday against the ratio', async () => {
    logWork('2026-09-06', 8);
    logWork('2026-09-07', 8);
    // 09-08 never logged
    logWork('2026-09-09', 8);
    logWork('2026-09-10', 8);

    await renderDashboard();
    await user.click(screen.getByRole('tab', { name: 'Month' }));

    // 5 workdays allocated (40h), 4 worked (32h) = 80%.
    expect(breakdown('Allocated')).toBe('40h');
    expect(breakdown('Actual')).toBe('32h');
    expect(breakdown('Missed')).toBe('1');
    expect(screen.getByText('80%')).toBeInTheDocument();
  });
});

describe('all-time view — hand-calculated', () => {
  it('spans from the first logged day to today', async () => {
    logWork('2026-08-31', 8); // a Monday, earlier month
    logWork('2026-09-10', 4);

    await renderDashboard();
    await user.click(screen.getByRole('tab', { name: 'All time' }));

    // 31 Aug (Mon) .. 10 Sep (Thu). Workdays in that span, excluding Fri/Sat:
    // Aug 31, Sep 1,2,3 (Tue-Thu), Sep 6,7,8,9,10 = 9 workdays x 8h = 72h.
    expect(breakdown('Allocated')).toBe('72h');
    expect(breakdown('Actual')).toBe('12h');
    // Navigation is meaningless for all-time, so both arrows are inert.
    expect(screen.getByRole('button', { name: /previous period/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next period/i })).toBeDisabled();
  });
});

describe('off days and excused days in the totals', () => {
  // Brief section 8: off days are never allocated time.
  it('allocates nothing for Fri/Sat but still counts work done then', async () => {
    logWork('2026-09-10', 8);
    logWork('2026-09-11', 3); // Friday

    await renderDashboard();
    // Week view spans Sun 09-06 .. Sat 09-12, clamped to today (Thu 09-10),
    // so Friday's work is outside the clamped range.
    await user.click(screen.getByRole('tab', { name: 'Day' }));
    expect(breakdown('Allocated')).toBe('8h');
  });

  it('drops an excused day from both sides of the ratio', async () => {
    logWork('2026-09-09', 8);
    store.update(key('2026-09-10'), (log) => ({ ...log, excused: true }));

    await renderDashboard();
    expect(breakdown('Excused')).toBe('1');
    // Only 09-09 counts: 8h of 8h.
    expect(breakdown('Allocated')).toBe('8h');
    expect(breakdown('Actual')).toBe('8h');
  });
});

describe('streaks', () => {
  it('shows the work streak', async () => {
    logWork('2026-09-08', 8);
    logWork('2026-09-09', 8);
    logWork('2026-09-10', 8);

    await renderDashboard();
    const streak = screen.getByText('Work streak').parentElement;
    expect(within(streak as HTMLElement).getByText('3')).toBeInTheDocument();
  });

  // Decision 10: an unfinished today is pending, not a break.
  it('marks today as still open when it is short', async () => {
    logWork('2026-09-08', 8);
    logWork('2026-09-09', 8);
    logWork('2026-09-10', 1);

    await renderDashboard();
    expect(screen.getByText(/today still open/i)).toBeInTheDocument();
    const streak = screen.getByText('Work streak').parentElement;
    expect(within(streak as HTMLElement).getByText('2')).toBeInTheDocument();
  });

  it('shows the cigarette streak and today-s count', async () => {
    store.update(key('2026-09-09'), (log) => ({ ...log, cigarettes: 0 }));
    store.update(key('2026-09-10'), (log) => ({ ...log, cigarettes: 2 }));

    await renderDashboard();
    expect(screen.getByText(/2 today/i)).toBeInTheDocument();
  });
});

describe('honesty check-in summary', () => {
  it('summarises answered blocks and keeps unanswered separate', async () => {
    store.update(key('2026-09-10'), (log) => ({
      ...log,
      workSessions: [session(1, 'yes'), session(1, 'yes'), session(1, 'no'), session(1, 'unanswered')],
    }));

    await renderDashboard();
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.getByText(/1 unanswered/i)).toBeInTheDocument();
  });

  it('shows a dash when nothing has been answered', async () => {
    await renderDashboard();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('navigation', () => {
  it('moves back a week and forward again', async () => {
    logWork('2026-09-01', 8); // previous week (Tuesday)
    logWork('2026-09-10', 8);

    await renderDashboard();
    await user.click(screen.getByRole('button', { name: /previous period/i }));
    expect(screen.getByText(/30 August 2026/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next period/i }));
    expect(screen.getByText(/6 September 2026/)).toBeInTheDocument();
  });

  it('cannot navigate into the future', async () => {
    logWork('2026-09-10', 8);
    await renderDashboard();
    expect(screen.getByRole('button', { name: /next period/i })).toBeDisabled();
  });

  it('re-anchors to today when the granularity changes', async () => {
    logWork('2026-09-01', 8);
    logWork('2026-09-10', 8);

    await renderDashboard();
    await user.click(screen.getByRole('button', { name: /previous period/i }));
    await user.click(screen.getByRole('tab', { name: 'Day' }));
    expect(screen.getByText('10 September 2026')).toBeInTheDocument();
  });
});

describe('empty state', () => {
  it('says nothing is scheduled rather than showing a misleading chart', async () => {
    await renderDashboard();
    await user.click(screen.getByRole('tab', { name: 'All time' }));
    expect(screen.getByText(/nothing scheduled/i)).toBeInTheDocument();
  });
});

describe('deadlines', () => {
  it('seeds the two milestones from the brief', async () => {
    await renderDashboard();
    expect(screen.getByDisplayValue('Trading bot')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Interview prep')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-09-15')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-09-19')).toBeInTheDocument();
  });

  it('shows days remaining, counting workdays separately', async () => {
    await renderDashboard();
    // 10 Sep -> 15 Sep is 5 days; workdays are 10, 13, 14, 15 = 4.
    expect(screen.getByText(/5d left · 4 workdays/)).toBeInTheDocument();
  });

  it('adds a deadline', async () => {
    await renderDashboard();
    await user.type(screen.getByRole('textbox', { name: /new deadline title/i }), 'Discord clone');
    await user.type(screen.getByLabelText(/new deadline date/i), '2026-10-20');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(store.deadlines.deadlines.some((d) => d.title === 'Discord clone')).toBe(true);
  });

  it('removes a deadline', async () => {
    await renderDashboard();
    await user.click(screen.getByRole('button', { name: /remove trading bot/i }));
    expect(store.deadlines.deadlines.some((d) => d.title === 'Trading bot')).toBe(false);
  });

  it('marks one complete', async () => {
    await renderDashboard();
    await user.click(screen.getByRole('checkbox', { name: /mark trading bot complete/i }));
    expect(store.deadlines.deadlines.find((d) => d.id === 'trading-bot')?.completed).toBe(true);
  });

  it('flags an overdue deadline', async () => {
    store.setDeadlines({
      schemaVersion: 2,
      updatedAt: 0,
      deadlines: [
        { id: 'late', title: 'Late thing', dueDate: key('2026-09-01'), completed: false, note: '' },
      ],
    });

    await renderDashboard();
    expect(screen.getByText(/9d overdue/)).toBeInTheDocument();
  });
});
