import { beforeEach, describe, expect, it } from 'vitest';
import { parseDayKey, updateBlock, type DayKey } from '@/domain';
import { NOW } from '@/test/fixtures';
import { MemoryAdapter } from './adapter';
import { DayLogStore } from './dayLogStore';

const SUNDAY: DayKey = parseDayKey('2026-09-06');
const MONDAY: DayKey = parseDayKey('2026-09-07');
const FRIDAY: DayKey = parseDayKey('2026-09-11');

let adapter: MemoryAdapter;
let store: DayLogStore;

beforeEach(async () => {
  adapter = new MemoryAdapter();
  store = new DayLogStore(adapter, { now: () => NOW });
  await store.hydrate();
});

describe('routine snapshots', () => {
  it('gives a new workday a copy of the current template', () => {
    const log = store.ensureDay(SUNDAY);
    expect(log.routine).toHaveLength(store.template.blocks.length);
    expect(log.routine.map((b) => b.id)).toEqual(store.template.blocks.map((b) => b.id));
  });

  // Brief section 2: off days must not show the workday schedule at all.
  it('gives an off day no routine', () => {
    expect(store.ensureDay(FRIDAY).routine).toEqual([]);
  });
});

// The acceptance criterion for M3 (brief section 7).
describe('template edits are forward-only', () => {
  it('leaves an existing day untouched when a block is renamed', () => {
    const before = store.ensureDay(SUNDAY);
    const originalNames = before.routine.map((b) => b.name);

    store.setTemplate(updateBlock(store.template, 'tea', { name: 'Coffee' }, NOW));

    expect(store.get(SUNDAY)?.routine.map((b) => b.name)).toEqual(originalNames);
    expect(store.get(SUNDAY)?.routine.find((b) => b.id === 'tea')?.name).toBe('Tea');
  });

  it('leaves an existing day untouched when a block is removed', () => {
    const before = store.ensureDay(SUNDAY);
    const originalLength = before.routine.length;

    store.setTemplate({ ...store.template, blocks: [] });

    expect(store.get(SUNDAY)?.routine).toHaveLength(originalLength);
  });

  it('leaves an existing day untouched when times change', () => {
    store.ensureDay(SUNDAY);
    store.setTemplate(updateBlock(store.template, 'work-start', { startMinute: 7 * 60 }, NOW));

    const start = store.get(SUNDAY)?.routine.find((b) => b.id === 'work-start');
    expect(start?.startMinute).toBe(10 * 60);
  });

  it('applies the change to a day created afterwards', () => {
    store.ensureDay(SUNDAY);
    store.setTemplate(updateBlock(store.template, 'tea', { name: 'Coffee' }, NOW));

    const monday = store.ensureDay(MONDAY);
    expect(monday.routine.find((b) => b.id === 'tea')?.name).toBe('Coffee');
    // ...while the earlier day still says Tea.
    expect(store.get(SUNDAY)?.routine.find((b) => b.id === 'tea')?.name).toBe('Tea');
  });

  it('survives a restart with both days keeping their own routine', async () => {
    store.ensureDay(SUNDAY);
    store.setTemplate(updateBlock(store.template, 'tea', { name: 'Coffee' }, NOW));
    store.ensureDay(MONDAY);
    await store.settled();

    const reopened = new DayLogStore(adapter, { now: () => NOW });
    await reopened.hydrate();

    expect(reopened.get(SUNDAY)?.routine.find((b) => b.id === 'tea')?.name).toBe('Tea');
    expect(reopened.get(MONDAY)?.routine.find((b) => b.id === 'tea')?.name).toBe('Coffee');
    expect(reopened.template.blocks.find((b) => b.id === 'tea')?.name).toBe('Coffee');
  });
});

describe('migration of older records', () => {
  it('upgrades a record written before routines existed', async () => {
    // A v1 day log: no `routine`, and sessions without the M2 fields.
    await adapter.put('dayLogs', SUNDAY, {
      schemaVersion: 1,
      dayKey: SUNDAY,
      kind: 'workday',
      excused: false,
      allocatedMinutes: 480,
      workSessions: [
        { id: 's1', startedAt: 0, endedAt: 60_000, source: 'pomodoro', distractionFree: 'yes' },
      ],
      offlineReports: [],
      lunchMinutes: 0,
      cigarettes: 3,
      sleepDebt: false,
      note: '',
      createdAt: 0,
      updatedAt: 0,
    });

    const reopened = new DayLogStore(adapter, { now: () => NOW });
    await reopened.hydrate();

    const log = reopened.get(SUNDAY);
    // The day is upgraded, not dropped: its data survives intact.
    expect(log?.cigarettes).toBe(3);
    expect(log?.routine).toEqual([]);
    expect(log?.workSessions[0]?.pausedMs).toBe(0);
    expect(log?.workSessions[0]?.completedFullInterval).toBe(false);
    expect(log?.schemaVersion).toBe(2);
  });

  it('skips a record with no usable day key but keeps the rest', async () => {
    await adapter.put('dayLogs', 'junk', { dayKey: 'not-a-date' });
    await adapter.put('dayLogs', SUNDAY, { dayKey: SUNDAY, cigarettes: 1 });

    const reopened = new DayLogStore(adapter, { now: () => NOW });
    await reopened.hydrate();

    expect(reopened.all().size).toBe(1);
    expect(reopened.get(SUNDAY)?.cigarettes).toBe(1);
  });
});
