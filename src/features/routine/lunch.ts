import { MAX_LUNCH_MINUTES, MS_PER_MINUTE, type DayKey } from '@/domain';
import type { KeyValueStorage } from '@/features/timer';

export const LUNCH_STORAGE_KEY = 'workplanner.lunch';
export const LUNCH_SNAPSHOT_VERSION = 1;
export const MAX_LUNCH_MS = MAX_LUNCH_MINUTES * MS_PER_MINUTE;

export interface LunchSnapshot {
  readonly version: number;
  readonly dayKey: DayKey;
  readonly startedAt: number;
}

/**
 * Lunch needs no heartbeat: it has no pause, so its elapsed time is simply
 * `now - startedAt`. Recording the start instant is enough to reconstruct it
 * exactly after a reload or a crash.
 */
export function writeLunch(storage: KeyValueStorage | null, snapshot: LunchSnapshot): void {
  if (storage === null) return;
  try {
    storage.setItem(LUNCH_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // A blocked store must not prevent lunch from running.
  }
}

export function clearLunch(storage: KeyValueStorage | null): void {
  if (storage === null) return;
  try {
    storage.removeItem(LUNCH_STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

export function readLunch(storage: KeyValueStorage | null): LunchSnapshot | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(LUNCH_STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Partial<LunchSnapshot>;
    if (candidate.version !== LUNCH_SNAPSHOT_VERSION) return null;
    if (typeof candidate.startedAt !== 'number' || typeof candidate.dayKey !== 'string') {
      return null;
    }
    return candidate as LunchSnapshot;
  } catch {
    return null;
  }
}

/**
 * Elapsed lunch time, capped at 60 minutes (brief section 3). Sitting at the
 * table for two hours records one hour of lunch; the cap is on the record, not
 * on the user.
 */
export function lunchElapsedMs(startedAt: number, now: number): number {
  return Math.min(MAX_LUNCH_MS, Math.max(0, now - startedAt));
}

/** A snapshot from a previous day is stale — lunch does not carry over. */
export function isLunchForToday(snapshot: LunchSnapshot | null, today: DayKey): boolean {
  return snapshot !== null && snapshot.dayKey === today;
}
