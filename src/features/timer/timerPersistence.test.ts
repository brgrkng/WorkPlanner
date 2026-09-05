import { beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings, parseDayKey, sessionMs, type Settings } from '@/domain';
import {
  HEARTBEAT_INTERVAL_MS,
  MAX_RECOVERABLE_MS,
  TIMER_STORAGE_KEY,
  clearSnapshot,
  readSnapshot,
  recoverFromSnapshot,
  resumableState,
  writeSnapshot,
  type KeyValueStorage,
  type TimerSnapshot,
} from './timerPersistence';
import { IDLE, pause, startBreak, startWork, type TimerState } from './timerState';

const MIN = 60_000;
const DAY = parseDayKey('2026-09-06');
const T0 = new Date(2026, 8, 6, 10, 0).getTime();
const settings: Settings = defaultSettings();

class FakeStorage implements KeyValueStorage {
  readonly map = new Map<string, string>();
  throwOnWrite = false;
  throwOnRead = false;

  getItem(key: string): string | null {
    if (this.throwOnRead) throw new Error('blocked');
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.throwOnWrite) throw new Error('quota exceeded');
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

let storage: FakeStorage;
const working = (): TimerState => startWork(IDLE, T0, 'session-1', DAY);

beforeEach(() => {
  storage = new FakeStorage();
});

describe('snapshot round-trip', () => {
  it('writes and reads a running timer', () => {
    writeSnapshot(storage, working(), T0 + 10 * MIN);
    const snapshot = readSnapshot(storage);
    expect(snapshot?.state.phase).toBe('work');
    expect(snapshot?.heartbeatAt).toBe(T0 + 10 * MIN);
  });

  it('clears the snapshot when the timer goes idle', () => {
    writeSnapshot(storage, working(), T0 + MIN);
    writeSnapshot(storage, IDLE, T0 + 2 * MIN);
    expect(readSnapshot(storage)).toBeNull();
  });

  it('returns null when nothing was stored', () => {
    expect(readSnapshot(storage)).toBeNull();
  });

  it('survives a blocked or full storage without throwing', () => {
    storage.throwOnWrite = true;
    expect(() => writeSnapshot(storage, working(), T0)).not.toThrow();
    storage.throwOnRead = true;
    expect(readSnapshot(storage)).toBeNull();
  });

  it('tolerates a null storage (private browsing)', () => {
    expect(() => writeSnapshot(null, working(), T0)).not.toThrow();
    expect(readSnapshot(null)).toBeNull();
    expect(() => clearSnapshot(null)).not.toThrow();
  });

  it('ignores corrupt JSON rather than crashing at startup', () => {
    storage.map.set(TIMER_STORAGE_KEY, '{not json');
    expect(readSnapshot(storage)).toBeNull();
  });

  it('ignores a snapshot from a future schema version', () => {
    storage.map.set(
      TIMER_STORAGE_KEY,
      JSON.stringify({ version: 99, state: working(), heartbeatAt: T0 }),
    );
    expect(readSnapshot(storage)).toBeNull();
  });

  it('ignores a structurally invalid snapshot', () => {
    storage.map.set(TIMER_STORAGE_KEY, JSON.stringify({ version: 1, state: { phase: 'bogus' } }));
    expect(readSnapshot(storage)).toBeNull();
  });
});

describe('recoverFromSnapshot — the power-cut path', () => {
  // The core scenario: working at 10:00, power dies at 10:18, machine is off
  // for an hour, app reopens at 11:20. The 18 minutes must be credited, and
  // nothing more (SESSION.md decision 2).
  it('credits time up to the last heartbeat, not up to now', () => {
    const snapshot: TimerSnapshot = {
      version: 1,
      state: working(),
      heartbeatAt: T0 + 18 * MIN,
    };
    const recovery = recoverFromSnapshot(snapshot, settings);

    expect(recovery.session).not.toBeNull();
    expect(sessionMs(recovery.session!)).toBe(18 * MIN);
    expect(recovery.session!.recovered).toBe(true);
    expect(recovery.clamped).toBe(false);
  });

  it('credits the session to the day it started, not to today', () => {
    const snapshot: TimerSnapshot = { version: 1, state: working(), heartbeatAt: T0 + 18 * MIN };
    expect(recoverFromSnapshot(snapshot, settings).dayKey).toBe(DAY);
  });

  it('preserves the duration invariant after recovery', () => {
    let state = working();
    state = pause(state, T0 + 10 * MIN);
    const snapshot: TimerSnapshot = { version: 1, state, heartbeatAt: T0 + 25 * MIN };
    const session = recoverFromSnapshot(snapshot, settings).session!;

    // Worked 10 minutes, then paused for 15 before the power cut.
    expect(sessionMs(session)).toBe(10 * MIN);
    expect(session.pausedMs).toBe(15 * MIN);
    expect(session.endedAt - session.startedAt - session.pausedMs).toBe(sessionMs(session));
  });

  it('flags a recovered session that reached the full interval', () => {
    const snapshot: TimerSnapshot = { version: 1, state: working(), heartbeatAt: T0 + 30 * MIN };
    expect(recoverFromSnapshot(snapshot, settings).session!.completedFullInterval).toBe(true);
  });

  it('does not flag a short recovered session as completed', () => {
    const snapshot: TimerSnapshot = { version: 1, state: working(), heartbeatAt: T0 + 6 * MIN };
    expect(recoverFromSnapshot(snapshot, settings).session!.completedFullInterval).toBe(false);
  });

  it('recovers nothing from an interrupted break', () => {
    const snapshot: TimerSnapshot = {
      version: 1,
      state: startBreak(T0, 'short'),
      heartbeatAt: T0 + 4 * MIN,
    };
    expect(recoverFromSnapshot(snapshot, settings).session).toBeNull();
  });

  it('recovers nothing when there is no snapshot', () => {
    expect(recoverFromSnapshot(null, settings).session).toBeNull();
  });

  it('recovers nothing from a zero-length session', () => {
    const snapshot: TimerSnapshot = { version: 1, state: working(), heartbeatAt: T0 };
    expect(recoverFromSnapshot(snapshot, settings).session).toBeNull();
  });

  it('recovers nothing when the heartbeat predates the start', () => {
    const snapshot: TimerSnapshot = { version: 1, state: working(), heartbeatAt: T0 - 5 * MIN };
    expect(recoverFromSnapshot(snapshot, settings).session).toBeNull();
  });

  // A bad clock must not be able to inject a fake day into the numbers.
  it('clamps an implausibly long session', () => {
    const snapshot: TimerSnapshot = {
      version: 1,
      state: working(),
      heartbeatAt: T0 + 40 * 60 * MIN,
    };
    const recovery = recoverFromSnapshot(snapshot, settings);
    expect(recovery.clamped).toBe(true);
    expect(sessionMs(recovery.session!)).toBe(MAX_RECOVERABLE_MS);
    expect(recovery.session!.endedAt - recovery.session!.startedAt - recovery.session!.pausedMs).toBe(
      MAX_RECOVERABLE_MS,
    );
  });
});

describe('resumableState — reload versus crash', () => {
  it('resumes a timer whose heartbeat is fresh', () => {
    const snapshot: TimerSnapshot = { version: 1, state: working(), heartbeatAt: T0 + 10 * MIN };
    const resumed = resumableState(snapshot, T0 + 10 * MIN + HEARTBEAT_INTERVAL_MS);
    expect(resumed?.phase).toBe('work');
  });

  it('refuses a stale heartbeat, so the crash path handles it instead', () => {
    const snapshot: TimerSnapshot = { version: 1, state: working(), heartbeatAt: T0 + 10 * MIN };
    expect(resumableState(snapshot, T0 + 40 * MIN)).toBeNull();
  });

  it('refuses an idle or missing snapshot', () => {
    expect(resumableState(null, T0)).toBeNull();
    expect(resumableState({ version: 1, state: IDLE, heartbeatAt: T0 }, T0)).toBeNull();
  });
});
