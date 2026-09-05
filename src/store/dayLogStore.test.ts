import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actualWorkedMs, parseDayKey, type DayLog } from '@/domain';
import { NOW, session } from '@/test/fixtures';
import { MemoryAdapter } from './adapter';
import { DayLogStore } from './dayLogStore';

const SUNDAY = parseDayKey('2026-09-06');
const FRIDAY = parseDayKey('2026-09-11');
const HOUR = 60 * 60 * 1000;

let adapter: MemoryAdapter;
let store: DayLogStore;

function newStore(): DayLogStore {
  return new DayLogStore(adapter, { now: () => NOW });
}

beforeEach(async () => {
  adapter = new MemoryAdapter();
  store = newStore();
  await store.hydrate();
});

describe('hydrate', () => {
  it('starts empty', () => {
    expect(store.isHydrated).toBe(true);
    expect(store.all().size).toBe(0);
  });

  it('loads previously written logs', async () => {
    store.update(SUNDAY, (log) => ({ ...log, cigarettes: 2 }));
    await store.settled();

    const reopened = newStore();
    await reopened.hydrate();
    expect(reopened.get(SUNDAY)?.cigarettes).toBe(2);
  });

  it('loads persisted settings over the defaults', async () => {
    store.updateSettings({ workIntervalMinutes: 40 });
    await store.settled();

    const reopened = newStore();
    await reopened.hydrate();
    expect(reopened.settings.workIntervalMinutes).toBe(40);
    // Untouched settings keep their defaults rather than becoming undefined.
    expect(reopened.settings.shortBreakMinutes).toBe(5);
  });

  it('skips a corrupt record instead of failing to start', async () => {
    await adapter.put('dayLogs', 'garbage', { dayKey: 'not-a-date' });
    await adapter.put('dayLogs', SUNDAY, {
      ...structuredClone({ dayKey: SUNDAY, cigarettes: 1 }),
    });

    const reopened = newStore();
    await reopened.hydrate();
    expect(reopened.all().size).toBe(1);
    expect(reopened.error).toBeInstanceOf(Error);
  });
});

describe('ensureDay', () => {
  it('creates a workday with the allocated snapshot', () => {
    const log = store.ensureDay(SUNDAY);
    expect(log.kind).toBe('workday');
    expect(log.allocatedMinutes).toBe(480);
  });

  it('creates an off day with zero allocation', () => {
    const log = store.ensureDay(FRIDAY);
    expect(log.kind).toBe('offday');
    expect(log.allocatedMinutes).toBe(0);
  });

  it('is idempotent', () => {
    const first = store.ensureDay(SUNDAY);
    const second = store.ensureDay(SUNDAY);
    expect(second).toBe(first);
    expect(store.all().size).toBe(1);
  });

  // Brief section 7: a settings change must never rewrite a day already logged.
  it('does not retroactively change an existing day when settings change', () => {
    const before = store.ensureDay(SUNDAY);
    store.updateSettings({ allocatedMinutesPerWorkday: 300 });
    expect(store.get(SUNDAY)?.allocatedMinutes).toBe(before.allocatedMinutes);

    // ...but a day created afterwards picks up the new value.
    const later = store.ensureDay(parseDayKey('2026-09-07'));
    expect(later.allocatedMinutes).toBe(300);
  });
});

describe('update', () => {
  it('returns the new log synchronously, before storage has been touched', () => {
    const updated = store.update(SUNDAY, (log) => ({ ...log, cigarettes: 3 }));
    expect(updated.cigarettes).toBe(3);
    expect(store.get(SUNDAY)?.cigarettes).toBe(3);
  });

  it('creates the day if it does not exist yet', () => {
    store.update(SUNDAY, (log) => ({ ...log, sleepDebt: true }));
    expect(store.get(SUNDAY)?.sleepDebt).toBe(true);
  });

  it('treats logs as immutable — the previous object is untouched', () => {
    const before = store.ensureDay(SUNDAY);
    store.update(SUNDAY, (log) => ({ ...log, cigarettes: 5 }));
    expect(before.cigarettes).toBe(0);
    expect(store.get(SUNDAY)).not.toBe(before);
  });

  it('accumulates work sessions', () => {
    store.update(SUNDAY, (log) => ({ ...log, workSessions: [session(90)] }));
    store.update(SUNDAY, (log) => ({
      ...log,
      workSessions: [...log.workSessions, session(150)],
    }));
    expect(actualWorkedMs(store.get(SUNDAY) as DayLog)).toBe(4 * HOUR);
  });

  it('cannot be tricked into writing under the wrong key', () => {
    store.update(SUNDAY, (log) => ({ ...log, dayKey: FRIDAY }));
    expect(store.get(SUNDAY)).toBeDefined();
    expect(store.get(FRIDAY)).toBeUndefined();
  });

  it('notifies subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.update(SUNDAY, (log) => ({ ...log, cigarettes: 1 }));
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    listener.mockClear();
    store.update(SUNDAY, (log) => ({ ...log, cigarettes: 2 }));
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('write ordering', () => {
  // Out-of-order persistence would silently resurrect an older value.
  it('persists rapid successive updates in order', async () => {
    for (let i = 1; i <= 20; i += 1) {
      store.update(SUNDAY, (log) => ({ ...log, cigarettes: i }));
    }
    await store.settled();

    const reopened = newStore();
    await reopened.hydrate();
    expect(reopened.get(SUNDAY)?.cigarettes).toBe(20);
  });
});

describe('persistence failure', () => {
  it('keeps the value in memory when the write fails', async () => {
    adapter.failWrites = true;
    store.update(SUNDAY, (log) => ({ ...log, cigarettes: 7 }));
    await store.settled();

    // The number the user is looking at must not vanish because a disk write failed.
    expect(store.get(SUNDAY)?.cigarettes).toBe(7);
    expect(store.unpersistedKeys.has(SUNDAY)).toBe(true);
    expect(store.error).toBeInstanceOf(Error);
  });

  it('recovers the failed write on flush', async () => {
    adapter.failWrites = true;
    store.update(SUNDAY, (log) => ({ ...log, cigarettes: 7 }));
    await store.settled();
    expect(store.unpersistedKeys.size).toBe(1);

    adapter.failWrites = false;
    await store.flush();
    expect(store.unpersistedKeys.size).toBe(0);

    const reopened = newStore();
    await reopened.hydrate();
    expect(reopened.get(SUNDAY)?.cigarettes).toBe(7);
  });

  it('flushes the latest value, not the one that failed', async () => {
    adapter.failWrites = true;
    store.update(SUNDAY, (log) => ({ ...log, cigarettes: 1 }));
    await store.settled();

    store.update(SUNDAY, (log) => ({ ...log, cigarettes: 9 }));
    await store.settled();

    adapter.failWrites = false;
    await store.flush();

    const reopened = newStore();
    await reopened.hydrate();
    expect(reopened.get(SUNDAY)?.cigarettes).toBe(9);
  });
});

describe('dirty tracking for the sync layer', () => {
  it('marks changed days dirty and clears them once synced', () => {
    store.update(SUNDAY, (log) => ({ ...log, cigarettes: 1 }));
    expect(store.dirtyKeys.has(SUNDAY)).toBe(true);

    store.markSynced(SUNDAY);
    expect(store.dirtyKeys.has(SUNDAY)).toBe(false);
  });
});

describe('dayKeyFor', () => {
  it('applies the configured rollover hour', () => {
    // 01:30 on Monday belongs to Sunday under the default 04:00 rollover.
    expect(store.dayKeyFor(new Date(2026, 8, 7, 1, 30))).toBe('2026-09-06');

    store.updateSettings({ rolloverHour: 0 });
    expect(store.dayKeyFor(new Date(2026, 8, 7, 1, 30))).toBe('2026-09-07');
  });

  it('derives today from the injected clock', () => {
    expect(store.today()).toBe('2026-09-06');
  });
});
