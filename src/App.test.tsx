import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const SUNDAY = new Date(2026, 8, 6, 10, 0); // workday
const SATURDAY = new Date(2026, 8, 12, 10, 0); // off day

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('App', () => {
  // No indexedDB in this environment, so this also exercises the MemoryAdapter
  // fallback: the app must still start when storage is unavailable.
  it('renders the routine and timer on a workday', async () => {
    vi.setSystemTime(SUNDAY);
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'WorkPlanner' })).toBeInTheDocument();
    expect(screen.getByText('Interview prep')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start work/i })).toBeInTheDocument();
  });

  // Brief section 2: Fri/Sat must not show the workday schedule or timer.
  it('hides the schedule and timer on an off day', async () => {
    vi.setSystemTime(SATURDAY);
    render(<App />);

    expect(await screen.findByText(/off day/i)).toBeInTheDocument();
    expect(screen.queryByText('Interview prep')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start work/i })).not.toBeInTheDocument();

    // Available, but only behind a deliberate click — never prompted.
    expect(screen.getByRole('button', { name: /work anyway/i })).toBeInTheDocument();
  });
});
