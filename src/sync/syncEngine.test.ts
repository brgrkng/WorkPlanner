import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDayKey, type DayKey, type DayLog } from '@/domain';
import { DayLogStore, MemoryAdapter, type MetaSnapshot } from '@/store';
import type { RemoteAdapter } from './remote';
import { SyncEngine } from './syncEngine';

const SUNDAY: DayKey = parseDayKey('2026-09-06');
const MONDAY: DayKey = parseDayKey('2026-09-07');
const NOW = new Date(2026, 8, 6, 12, 0).getTime();

/** In-memory stand-in for Firestore. */
class FakeRemote implements RemoteAdapter {
  uid: string | null = 'user-1';
  dayLogs = new Map<string, unknown>();
  meta: Partial<MetaSnapshot> = {};

  failNextPut = false;
  failFetch = false;
  putCount = 0;
  private listeners = new Set<(uid: string | null) => void>();

  currentUser(): string | null {
    return this.uid;
  }

  onUserChange(listener: (uid: string | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setUser(uid: string | null): void {
    this.uid = uid;
    for (const listener of this.listeners) listener(uid);
  }

  signIn(): Promise<string> {
    this.setUser('user-1');
    return Promise.resolve('user-1');
  }

  signOut(): Promise<void> {
    this.setUser(null);
    return Promise.resolve();
  }

  fetchDayLogs(): Promise<unknown[]> {
    if (this.failFetch) return Promise.reject(new Error('network down'));
    return Promise.resolve([...this.dayLogs.values()]);
  }

  fetchMeta(): Promise<Partial<MetaSnapshot>> {
    if (this.failFetch) return Promise.reject(new Error('network down'));
    return Promise.resolve(this.meta);
  }

  putDayLog(_uid: string, dayKey: string, log: unknown): Promise<void> {
    if (this.failNextPut) {
      this.failNextPut = false;
      return Promise.reject(new Error('write failed'));
    }
    this.putCount += 1;
    this.dayLogs.set(dayKey, log);
    return Promise.resolve();
  }

  putMeta(_uid: string, meta: MetaSnapshot): Promise<void> {
    this.meta = meta;
    return Promise.resolve();
  }
}

let store: DayLogStore;
let remote: FakeRemote;
let engine: SyncEngine;
let online = true;

function build(): void {
  engine = new SyncEngine(store, remote, {
    debounceMs: 0,
    now: () => NOW,
    isOnline: () => online,
  });
}

/** A day log as the server would hold it. */
function remoteLog(dayKey: DayKey, cigarettes: number, updatedAt: number): DayLog {
  return {
    schemaVersion: 2,
    dayKey,
    kind: 'workday',
    excused: false,
    allocatedMinutes: 480,
    routine: [],
    workSessions: [],
    offlineReports: [],
    lunchMinutes: 0,
    cigarettes,
    sleepDebt: false,
    note: '',
    createdAt: 0,
    updatedAt,
  };
}

beforeEach(async () => {
  online = true;
  store = new DayLogStore(new MemoryAdapter(), { now: () => NOW });
  await store.hydrate();
  remote = new FakeRemote();
  build();
});

describe('push', () => {
  it('sends locally changed days', async () => {
    store.update(SUNDAY, (log) => ({ ...log, cigarettes: 2 }));
    await engine.syncNow();

    expect(remote.dayLogs.has(SUNDAY)).toBe(true);
    expect(store.dirtyKeys.size).toBe(0);
  });

  it('sends the meta documents when they change', async () => {
    store.updateSettings({ workIntervalMinutes: 40 });
    await engine.syncNow();

    expect(remote.meta.settings?.workIntervalMinutes).toBe(40);
    expect(store.metaDirty).toBe(false);
  });

  it('does not resend an unchanged day', async () => {
    store.update(SUNDAY, (log) => ({ ...log, cigarettes: 1 }));
    await engine.syncNow();
    const after = remote.putCount;

    await engine.syncNow();
    expect(remote.putCount).toBe(after);
  });

  // Rule 2: nothing is marked synced until the write actually succeeded.
  it('leaves a day dirty when the write fails, so it is retried', async () => {
    store.update(SUNDAY, (log) => ({ ...log, cigarettes: 3 }));
    remote.failNextPut = true;
    await engine.syncNow();

    expect(store.dirtyKeys.has(SUNDAY)).toBe(true);
    expect(engine.getStatus().phase).toBe('error');

    await engine.syncNow();
    expect(store.dirtyKeys.size).toBe(0);
    expect(remote.dayLogs.has(SUNDAY)).toBe(true);
  });
});

describe('pull and merge', () => {
  it('brings down a day that exists only on the server', async () => {
    remote.dayLogs.set(MONDAY, remoteLog(MONDAY, 4, 5_000));
    await engine.syncNow();

    expect(store.get(MONDAY)?.cigarettes).toBe(4);
  });

  // Rule 3: last-write-wins on updatedAt.
  it('accepts a newer remote copy', async () => {
    store.update(SUNDAY, (log) => ({ ...log, cigarettes: 1 }));
    const local = store.get(SUNDAY) as DayLog;
    remote.dayLogs.set(SUNDAY, remoteLog(SUNDAY, 9, local.updatedAt + 1_000));

    await engine.syncNow();
    expect(store.get(SUNDAY)?.cigarettes).toBe(9);
  });

  it('keeps a newer local copy', async () => {
    store.update(SUNDAY, (log) => ({ ...log, cigarettes: 1 }));
    const local = store.get(SUNDAY) as DayLog;
    remote.dayLogs.set(SUNDAY, remoteLog(SUNDAY, 9, local.updatedAt - 1_000));

    await engine.syncNow();
    expect(store.get(SUNDAY)?.cigarettes).toBe(1);
  });

  // A local edit must never be replaced by an identical-age remote copy.
  it('keeps the local copy on a tie', async () => {
    store.update(SUNDAY, (log) => ({ ...log, cigarettes: 1 }));
    const local = store.get(SUNDAY) as DayLog;
    remote.dayLogs.set(SUNDAY, remoteLog(SUNDAY, 9, local.updatedAt));

    await engine.syncNow();
    expect(store.get(SUNDAY)?.cigarettes).toBe(1);
  });

  it('does not re-dirty a day that came from the server', async () => {
    remote.dayLogs.set(MONDAY, remoteLog(MONDAY, 4, 5_000));
    await engine.syncNow();
    expect(store.dirtyKeys.has(MONDAY)).toBe(false);
  });

  it('persists a merged day locally so it survives a restart', async () => {
    const adapter = new MemoryAdapter();
    store = new DayLogStore(adapter, { now: () => NOW });
    await store.hydrate();
    build();

    remote.dayLogs.set(MONDAY, remoteLog(MONDAY, 7, 5_000));
    await engine.syncNow();
    await store.settled();

    const reopened = new DayLogStore(adapter, { now: () => NOW });
    await reopened.hydrate();
    expect(reopened.get(MONDAY)?.cigarettes).toBe(7);
  });

  it('ignores an unusable remote record instead of failing the whole sync', async () => {
    remote.dayLogs.set('junk', { dayKey: 'not-a-date' });
    remote.dayLogs.set(MONDAY, remoteLog(MONDAY, 2, 5_000));

    await engine.syncNow();
    expect(store.get(MONDAY)?.cigarettes).toBe(2);
    expect(engine.getStatus().phase).toBe('idle');
  });

  it('merges meta only when the remote copy is newer', async () => {
    store.updateSettings({ workIntervalMinutes: 30 });
    const localUpdatedAt = store.settings.updatedAt;

    remote.meta = {
      settings: { ...store.settings, workIntervalMinutes: 50, updatedAt: localUpdatedAt - 1 },
    };
    await engine.syncNow();
    expect(store.settings.workIntervalMinutes).toBe(30);

    remote.meta = {
      settings: { ...store.settings, workIntervalMinutes: 50, updatedAt: localUpdatedAt + 1 },
    };
    await engine.syncNow();
    expect(store.settings.workIntervalMinutes).toBe(50);
  });
});

describe('offline', () => {
  // Rule 1: the app is designed to run offline for hours. That is not an error.
  it('reports offline rather than error, and keeps changes pending', async () => {
    online = false;
    store.update(SUNDAY, (log) => ({ ...log, cigarettes: 5 }));
    await engine.syncNow();

    expect(engine.getStatus().phase).toBe('offline');
    expect(store.dirtyKeys.has(SUNDAY)).toBe(true);
    // The local value is untouched and still readable.
    expect(store.get(SUNDAY)?.cigarettes).toBe(5);
  });

  it('flushes everything that accumulated once back online', async () => {
    online = false;
    store.update(SUNDAY, (log) => ({ ...log, cigarettes: 5 }));
    store.update(MONDAY, (log) => ({ ...log, cigarettes: 1 }));
    await engine.syncNow();
    expect(remote.dayLogs.size).toBe(0);

    online = true;
    await engine.syncNow();
    expect(remote.dayLogs.size).toBe(2);
    expect(store.dirtyKeys.size).toBe(0);
  });

  it('survives a failed fetch without losing local data', async () => {
    store.update(SUNDAY, (log) => ({ ...log, cigarettes: 5 }));
    remote.failFetch = true;
    await engine.syncNow();

    expect(engine.getStatus().phase).toBe('error');
    expect(store.get(SUNDAY)?.cigarettes).toBe(5);
    expect(store.dirtyKeys.has(SUNDAY)).toBe(true);
  });
});

describe('auth', () => {
  it('does nothing while signed out', async () => {
    remote.setUser(null);
    store.update(SUNDAY, (log) => ({ ...log, cigarettes: 1 }));
    await engine.syncNow();

    expect(remote.dayLogs.size).toBe(0);
    expect(engine.getStatus().phase).toBe('signed-out');
  });

  it('syncs after signing in', async () => {
    remote.setUser(null);
    store.update(SUNDAY, (log) => ({ ...log, cigarettes: 1 }));

    await engine.signIn('a@b.c', 'password');
    expect(remote.dayLogs.has(SUNDAY)).toBe(true);
  });
});

describe('with no backend configured', () => {
  // The state the app ships in until Firebase is set up — and the state it
  // falls back to if the project is ever removed.
  it('is inert and never throws', async () => {
    const offlineOnly = new SyncEngine(store, null, { debounceMs: 0 });
    offlineOnly.start();

    store.update(SUNDAY, (log) => ({ ...log, cigarettes: 1 }));
    await offlineOnly.syncNow();

    expect(offlineOnly.getStatus().phase).toBe('disabled');
    expect(store.get(SUNDAY)?.cigarettes).toBe(1);
    offlineOnly.stop();
  });
});

describe('scheduling', () => {
  it('coalesces a burst of edits into one sync', async () => {
    vi.useFakeTimers();
    engine = new SyncEngine(store, remote, { debounceMs: 50, now: () => NOW, isOnline: () => true });
    engine.start();

    for (let i = 0; i < 10; i += 1) {
      store.update(SUNDAY, (log) => ({ ...log, cigarettes: i }));
    }

    await vi.advanceTimersByTimeAsync(100);
    vi.useRealTimers();

    await engine.syncNow();
    // One day pushed, not ten times over.
    expect(remote.dayLogs.size).toBe(1);
    engine.stop();
  });
});

describe('a template arriving from the server', () => {
  // Same rule as a local edit: today follows the template, past days do not.
  it('is applied to today and migrated on the way in', async () => {
    const today = store.ensureDay(SUNDAY);
    expect(today.routine.find((b) => b.id === 'tea')?.name).toBe('Tea');

    remote.meta = {
      template: {
        schemaVersion: 4,
        updatedAt: store.template.updatedAt + 1_000,
        blocks: store.template.blocks.map((b) =>
          b.id === 'tea' ? { ...b, name: 'Coffee' } : b,
        ),
      },
    };

    await engine.syncNow();
    expect(store.get(SUNDAY)?.routine.find((b) => b.id === 'tea')?.name).toBe('Coffee');
  });
});
