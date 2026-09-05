import type { ReactNode } from 'react';
import { TimerContext } from './TimerContext';
import { useTimer } from './useTimer';

export function TimerProvider({ children }: { readonly children: ReactNode }) {
  return <TimerContext.Provider value={useTimer()}>{children}</TimerContext.Provider>;
}
