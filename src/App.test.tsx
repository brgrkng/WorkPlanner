import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const SUNDAY = new Date(2026, 8, 6, 10, 0); // workday
const SATURDAY = new Date(2026, 8, 12, 10, 0); // off day

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  localStorage.clear();
  user = userEvent.setup();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('App', () => {
  // No indexedDB in this environment, so this also exercises the MemoryAdapter
  // fallback: the app must still start when storage is unavailable.
  it('lands on the dashboard', async () => {
    vi.setSystemTime(SUNDAY);
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'WorkPlanner' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /dashboard/i })).toBeInTheDocument();
  });

  it('shows the routine and timer on a workday', async () => {
    vi.setSystemTime(SUNDAY);
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Today' }));

    const routine = screen.getByRole('region', { name: /today/i });
    expect(within(routine).getByText('Interview prep')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start work/i })).toBeInTheDocument();
  });

  // Brief section 2: Fri/Sat must not show the workday schedule or timer.
  it('hides the schedule and timer on an off day', async () => {
    vi.setSystemTime(SATURDAY);
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Today' }));

    expect(screen.getByText(/off day/i)).toBeInTheDocument();
    expect(screen.queryByText('Interview prep')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start work/i })).not.toBeInTheDocument();

    // Available, but only behind a deliberate click — never prompted.
    expect(screen.getByRole('button', { name: /work anyway/i })).toBeInTheDocument();
  });

  it('keeps a running session alive when switching views', async () => {
    vi.setSystemTime(SUNDAY);
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Today' }));
    await user.click(screen.getByRole('button', { name: /start work/i }));

    await user.click(screen.getByRole('button', { name: 'Dashboard' }));
    await user.click(screen.getByRole('button', { name: 'Today' }));

    // Still running: the stop control is present, not "Start work".
    expect(screen.getByRole('button', { name: /^stop$/i })).toBeInTheDocument();
  });
});
