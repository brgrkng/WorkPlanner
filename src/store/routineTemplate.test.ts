import { beforeEach, describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  addBlock,
  parseDayKey,
  removeBlock,
  toggleBlockCompletion,
  updateBlock,
  type DayKey,
} from '@/domain';
import { NOW } from '@/test/fixtures';
import { MemoryAdapter } from './adapter';
import { DayLogStore } from './dayLogStore';

// `NOW` is 2026-09-06 10:00, so TODAY is that Sunday.
const THURSDAY: DayKey = parseDayKey('2026-09-03'); // a past workday
const SUNDAY: DayKey = parseDayKey('2026-09-06'); // today
const MONDAY: DayKey = parseDayKey('2026-09-07'); // tomorrow
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

// Edits land on today immediately and carry forward; days before today are
// frozen records of what actually happened (brief section 7).
describe('template edits apply from today onward', () => {
  it('renames a block on today straight away', () => {
    store.ensureDay(SUNDAY);
    store.setTemplate(updateBlock(store.template, 'tea', { name: 'Coffee' }, NOW));

    expect(store.get(SUNDAY)?.routine.find((b) => b.id === 'tea')?.name).toBe('Coffee');
  });

  it('removes a block from today straight away', () => {
    const before = store.ensureDay(SUNDAY);
    store.setTemplate(removeBlock(store.template, 'gaming', NOW));

    const routine = store.get(SUNDAY)?.routine ?? [];
    expect(routine).toHaveLength(before.routine.length - 1);
    expect(routine.some((b) => b.id === 'gaming')).toBe(false);
  });

  it('adds a new block to today, unticked', () => {
    store.ensureDay(SUNDAY);
    store.setTemplate(
      addBlock(
        store.template,
        {
          id: 'reading',
          name: 'Reading',
          startMinute: null,
          durationMinutes: null,
          note: '',
          isWorkBlock: false,
        },
        NOW,
      ),
    );

    const added = store.get(SUNDAY)?.routine.find((b) => b.id === 'reading');
    expect(added?.name).toBe('Reading');
    expect(added?.completedAt).toBeNull();
  });

  it('changes a time on today straight away', () => {
    store.ensureDay(SUNDAY);
    store.setTemplate(updateBlock(store.template, 'work-start', { startMinute: 7 * 60 }, NOW));

    expect(store.get(SUNDAY)?.routine.find((b) => b.id === 'work-start')?.startMinute).toBe(
      7 * 60,
    );
  });

  it('picks up a new work flag, so the timer can be pointed at it', () => {
    store.ensureDay(SUNDAY);
    store.setTemplate(updateBlock(store.template, 'gaming', { isWorkBlock: true }, NOW));

    expect(store.get(SUNDAY)?.routine.find((b) => b.id === 'gaming')?.isWorkBlock).toBe(true);
  });

  // Losing the morning's ticks to an afternoon edit would be its own data loss.
  it('keeps what has already been ticked off', () => {
    store.ensureDay(SUNDAY);
    store.update(SUNDAY, (log) => ({
      ...log,
      routine: toggleBlockCompletion(log.routine, 'nap', NOW),
    }));

    store.setTemplate(updateBlock(store.template, 'tea', { name: 'Coffee' }, NOW));

    expect(store.get(SUNDAY)?.routine.find((b) => b.id === 'nap')?.completedAt).toBe(NOW);
  });

  it('drops the tick along with a block that was removed', () => {
    store.ensureDay(SUNDAY);
    store.update(SUNDAY, (log) => ({
      ...log,
      routine: toggleBlockCompletion(log.routine, 'nap', NOW),
    }));

    store.setTemplate(removeBlock(store.template, 'nap', NOW));
    expect(store.get(SUNDAY)?.routine.some((b) => b.id === 'nap')).toBe(false);
  });

  it('follows a reordering', () => {
    store.ensureDay(SUNDAY);
    const reordered = {
      ...store.template,
      blocks: [...store.template.blocks].reverse(),
      updatedAt: NOW,
    };
    store.setTemplate(reordered);

    expect(store.get(SUNDAY)?.routine.map((b) => b.id)).toEqual(
      reordered.blocks.map((b) => b.id),
    );
  });

  // The guarantee that still holds: history is not rewritten.
  it('leaves a past day completely untouched', () => {
    const past = store.ensureDay(THURSDAY);
    const before = past.routine.map((b) => ({ ...b }));

    store.setTemplate(updateBlock(store.template, 'tea', { name: 'Coffee' }, NOW));
    store.setTemplate(removeBlock(store.template, 'gaming', NOW));

    expect(store.get(THURSDAY)?.routine).toEqual(before);
    expect(store.get(THURSDAY)?.routine.find((b) => b.id === 'tea')?.name).toBe('Tea');
  });

  it('applies to a future day that already exists', () => {
    store.ensureDay(MONDAY);
    store.setTemplate(updateBlock(store.template, 'tea', { name: 'Coffee' }, NOW));

    expect(store.get(MONDAY)?.routine.find((b) => b.id === 'tea')?.name).toBe('Coffee');
  });

  it('applies to a day created afterwards', () => {
    store.setTemplate(updateBlock(store.template, 'tea', { name: 'Coffee' }, NOW));
    expect(store.ensureDay(MONDAY).routine.find((b) => b.id === 'tea')?.name).toBe('Coffee');
  });

  // Brief section 2: Fri/Sat have no routine, and an edit must not give them one.
  it('does not give an off day a routine', () => {
    store.ensureDay(FRIDAY);
    store.setTemplate(updateBlock(store.template, 'tea', { name: 'Coffee' }, NOW));

    expect(store.get(FRIDAY)?.routine).toEqual([]);
  });

  // An edit that changes nothing must not mark days dirty for sync.
  it('does not touch a day when the edit changes nothing', () => {
    store.ensureDay(SUNDAY);
    const before = store.get(SUNDAY);

    store.setTemplate({ ...store.template, updatedAt: NOW + 1 });
    expect(store.get(SUNDAY)).toBe(before);
  });

  it('survives a restart, with today changed and the past day preserved', async () => {
    store.ensureDay(THURSDAY);
    store.ensureDay(SUNDAY);
    store.setTemplate(updateBlock(store.template, 'tea', { name: 'Coffee' }, NOW));
    await store.settled();

    const reopened = new DayLogStore(adapter, { now: () => NOW });
    await reopened.hydrate();

    expect(reopened.get(SUNDAY)?.routine.find((b) => b.id === 'tea')?.name).toBe('Coffee');
    expect(reopened.get(THURSDAY)?.routine.find((b) => b.id === 'tea')?.name).toBe('Tea');
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
    // Logged before tasks existed: no task is a legitimate state, not a gap.
    expect(log?.workSessions[0]?.taskId).toBeNull();
    expect(log?.workSessions[0]?.taskName).toBe('');
    expect(log?.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('defaults routine blocks written before work items existed', async () => {
    await adapter.put('dayLogs', SUNDAY, {
      dayKey: SUNDAY,
      routine: [{ id: 'tea', name: 'Tea', startMinute: null, durationMinutes: 10, completedAt: null }],
    });

    const reopened = new DayLogStore(adapter, { now: () => NOW });
    await reopened.hydrate();
    expect(reopened.get(SUNDAY)?.routine[0]?.isWorkBlock).toBe(false);
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
