import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from './constants';
import { migrateDayLog } from './migrate';
import { migrateRoutineTemplate } from './routine';

/**
 * These fixtures are the shapes actually found in the deployed app's
 * IndexedDB, not invented ones. The v3 record below is the real
 * `2026-09-06` day: ten blocks, `isWorkBlock` present on every one, and not a
 * single block marked as work — which left the timer with no task to point at.
 */
function block(id: string, isWorkBlock?: boolean) {
  const base = { id, name: id, startMinute: null, durationMinutes: null, completedAt: null };
  return isWorkBlock === undefined ? base : { ...base, isWorkBlock };
}

const IDS = [
  'wake',
  'nap',
  'tea',
  'shower',
  'work-start',
  'interview-prep',
  'project-work',
  'work-end',
  'gaming',
  'wind-down',
];

function dayRecord(schemaVersion: number, routine: unknown[]) {
  return {
    schemaVersion,
    dayKey: '2026-09-06',
    kind: 'workday',
    excused: false,
    allocatedMinutes: 480,
    routine,
    workSessions: [],
    offlineReports: [],
    lunchMinutes: 0,
    cigarettes: 0,
    sleepDebt: false,
    note: '',
    createdAt: 1,
    updatedAt: 2,
  };
}

const workIds = (log: { routine: readonly { id: string; isWorkBlock: boolean }[] } | null) =>
  (log?.routine ?? []).filter((b) => b.isWorkBlock).map((b) => b.id);

describe('work-block repair', () => {
  it('restores the flags the v3 migration flattened', () => {
    // Exactly the damaged record from the deployed app.
    const damaged = dayRecord(
      3,
      IDS.map((id) => block(id, false)),
    );

    expect(workIds(migrateDayLog(damaged))).toEqual(['interview-prep', 'project-work']);
  });

  it('fills the flag in for a record written before it existed', () => {
    const preFlag = dayRecord(
      2,
      IDS.map((id) => block(id)),
    );

    expect(workIds(migrateDayLog(preFlag))).toEqual(['interview-prep', 'project-work']);
  });

  // The repair must never overrule a day the user actually configured.
  it('leaves a day that already has a work block alone', () => {
    const configured = dayRecord(3, [
      block('interview-prep', false),
      block('project-work', false),
      block('reading', true),
    ]);

    expect(workIds(migrateDayLog(configured))).toEqual(['reading']);
  });

  it('trusts a v4 record verbatim, including one with no work blocks at all', () => {
    const deliberate = dayRecord(
      SCHEMA_VERSION,
      IDS.map((id) => block(id, false)),
    );

    expect(workIds(migrateDayLog(deliberate))).toEqual([]);
  });

  // Only ids the default routine ships as work are assumed; a block the user
  // added is never guessed at.
  it('never assumes a user-added block is work', () => {
    const withOwnBlocks = dayRecord(2, [block('reading'), block('errands'), block('gaming')]);

    expect(workIds(migrateDayLog(withOwnBlocks))).toEqual([]);
  });

  it('stamps the current schema version so the repair runs once', () => {
    const damaged = dayRecord(
      3,
      IDS.map((id) => block(id, false)),
    );

    expect(migrateDayLog(damaged)?.schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe('routine template migration', () => {
  it('fills work flags into a template written before they existed', () => {
    const stored = { schemaVersion: 2, updatedAt: 99, blocks: IDS.map((id) => block(id)) };
    const migrated = migrateRoutineTemplate(stored, 1000);

    expect(migrated.blocks.filter((b) => b.isWorkBlock).map((b) => b.id)).toEqual([
      'interview-prep',
      'project-work',
    ]);
    expect(migrated.updatedAt).toBe(99);
  });

  // A template is live config, not history, so an explicit choice is kept.
  it('keeps an explicit flag exactly as stored', () => {
    const stored = {
      schemaVersion: 3,
      updatedAt: 99,
      blocks: [block('interview-prep', false), block('gaming', true)],
    };

    expect(
      migrateRoutineTemplate(stored, 1000)
        .blocks.filter((b) => b.isWorkBlock)
        .map((b) => b.id),
    ).toEqual(['gaming']);
  });

  it('falls back to the default template for an unusable record', () => {
    expect(migrateRoutineTemplate(null, 1000).blocks.length).toBeGreaterThan(0);
    expect(migrateRoutineTemplate({ blocks: 'nope' }, 1000).blocks.length).toBeGreaterThan(0);
  });
});
