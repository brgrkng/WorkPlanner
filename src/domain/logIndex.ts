import { compareDayKeys, type DayKey } from './time/dayKey';
import type { DayLogIndex } from './types';

/**
 * Earliest logged day. Nothing before this counts against the user in any
 * calculation — the app cannot judge days that predate its own existence
 * (SESSION.md decision 6).
 */
export function earliestLoggedDay(logs: DayLogIndex): DayKey | undefined {
  let earliest: DayKey | undefined;
  for (const dayKey of logs.keys()) {
    if (earliest === undefined || compareDayKeys(dayKey, earliest) < 0) earliest = dayKey;
  }
  return earliest;
}

export function latestLoggedDay(logs: DayLogIndex): DayKey | undefined {
  let latest: DayKey | undefined;
  for (const dayKey of logs.keys()) {
    if (latest === undefined || compareDayKeys(dayKey, latest) > 0) latest = dayKey;
  }
  return latest;
}
