import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseDayKey } from '@/domain';
import { dayLog } from '@/test/fixtures';
import { DayLogStore } from './dayLogStore';
import { IdbAdapter, isIndexedDbAvailable } from './idbAdapter';

const SUNDAY = parseDayKey('2026-09-06');

let dbCounter = 0;
let adapter: IdbAdapter;

// A fresh database per test so ordering never matters.
beforeEach(() => {
  adapter = new IdbAdapter(`workplanner-test-${(dbCounter += 1)}`);
});

describe('IdbAdapter', () => {
  it('reports IndexedDB as available', () => {
    expect(isIndexedDbAvailable()).toBe(true);
  });

  it('round-trips a value', async () => {
    await adapter.put('dayLogs', SUNDAY, dayLog('2026-09-06', { cigarettes: 4 }));
    const read = await adapter.get<{ cigarettes: number }>('dayLogs', SUNDAY);
    expect(read?.cigarettes).toBe(4);
  });

  it('returns undefined for a missing key', async () => {
    expect(await adapter.get('dayLogs', 'nope')).toBeUndefined();
  });

  it('overwrites on repeated put', async () => {
    await adapter.put('meta', 'settings', { workIntervalMinutes: 25 });
    await adapter.put('meta', 'settings', { workIntervalMinutes: 40 });
    const read = await adapter.get<{ workIntervalMinutes: number }>('meta', 'settings');
    expect(read?.workIntervalMinutes).toBe(40);
  });

  it('getAll returns every record in the store', async () => {
    await adapter.put('dayLogs', '2026-09-06', dayLog('2026-09-06'));
    await adapter.put('dayLogs', '2026-09-07', dayLog('2026-09-07'));
    expect(await adapter.getAll('dayLogs')).toHaveLength(2);
  });

  it('keeps the two stores separate', async () => {
    await adapter.put('dayLogs', 'k', { from: 'dayLogs' });
    await adapter.put('meta', 'k', { from: 'meta' });
    expect(await adapter.get<{ from: string }>('dayLogs', 'k')).toEqual({ from: 'dayLogs' });
    expect(await adapter.get<{ from: string }>('meta', 'k')).toEqual({ from: 'meta' });
  });

  it('deletes and clears', async () => {
    await adapter.put('dayLogs', 'a', dayLog('2026-09-06'));
    await adapter.put('dayLogs', 'b', dayLog('2026-09-07'));

    await adapter.delete('dayLogs', 'a');
    expect(await adapter.get('dayLogs', 'a')).toBeUndefined();
    expect(await adapter.getAll('dayLogs')).toHaveLength(1);

    await adapter.clear('dayLogs');
    expect(await adapter.getAll('dayLogs')).toHaveLength(0);
  });

  // The whole point of the local store: data outlives the page.
  it('survives closing and reopening the database', async () => {
    const name = `workplanner-persist-${(dbCounter += 1)}`;
    const first = new IdbAdapter(name);
    await first.put('dayLogs', SUNDAY, dayLog('2026-09-06', { cigarettes: 3 }));
    await first.close();

    const second = new IdbAdapter(name);
    const read = await second.get<{ cigarettes: number }>('dayLogs', SUNDAY);
    expect(read?.cigarettes).toBe(3);
    await second.close();
  });
});

describe('DayLogStore over IndexedDB', () => {
  // Simulates the real failure mode: the tab dies mid-day and the app restarts.
  it('recovers the full day log after a restart', async () => {
    const name = `workplanner-restart-${(dbCounter += 1)}`;

    const before = new DayLogStore(new IdbAdapter(name));
    await before.hydrate();
    before.update(SUNDAY, (log) => ({ ...log, cigarettes: 2, sleepDebt: true }));
    await before.settled();

    const after = new DayLogStore(new IdbAdapter(name));
    await after.hydrate();
    const recovered = after.get(SUNDAY);
    expect(recovered?.cigarettes).toBe(2);
    expect(recovered?.sleepDebt).toBe(true);
    expect(after.unpersistedKeys.size).toBe(0);
  });
});
