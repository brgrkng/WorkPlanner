import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  // No indexedDB in this environment, so this also exercises the MemoryAdapter
  // fallback: the app must still start when storage is unavailable.
  it('renders the timer once the store has hydrated', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'WorkPlanner' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start work/i })).toBeInTheDocument();
  });
});
