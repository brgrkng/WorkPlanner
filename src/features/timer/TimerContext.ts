import { createContext, useContext } from 'react';
import type { TimerView } from './useTimer';

export const TimerContext = createContext<TimerView | null>(null);

/**
 * The single shared timer instance.
 *
 * Lifted into context because more than one feature needs it: the timer panel
 * drives it, and the lunch control has to stop a running work session before
 * lunch starts (brief section 3 — lunch pauses work accounting).
 */
export function useTimerContext(): TimerView {
  const timer = useContext(TimerContext);
  if (timer === null) throw new Error('useTimerContext must be used inside <TimerProvider>');
  return timer;
}
