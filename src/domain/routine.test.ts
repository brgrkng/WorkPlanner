import { describe, expect, it } from 'vitest';
import {
  addBlock,
  completedBlockCount,
  defaultRoutineTemplate,
  formatTimeOfDay,
  moveBlock,
  parseTimeOfDay,
  removeBlock,
  snapshotRoutine,
  toggleBlockCompletion,
  updateBlock,
  type RoutineBlock,
  type RoutineTemplate,
} from './routine';

const NOW = new Date(2026, 8, 6, 10, 0).getTime();
const LATER = NOW + 60_000;

const template = (): RoutineTemplate => defaultRoutineTemplate(NOW);
const block = (id: string, name = id): RoutineBlock => ({
  id,
  name,
  startMinute: null,
  durationMinutes: null,
  note: '',
});

describe('time-of-day parsing', () => {
  it('round-trips', () => {
    expect(formatTimeOfDay(parseTimeOfDay('10:00'))).toBe('10:00');
    expect(formatTimeOfDay(parseTimeOfDay('09:05'))).toBe('09:05');
  });

  it('parses to minutes after midnight', () => {
    expect(parseTimeOfDay('00:00')).toBe(0);
    expect(parseTimeOfDay('10:00')).toBe(600);
    expect(parseTimeOfDay('23:59')).toBe(1439);
  });

  it('accepts a single-digit hour', () => {
    expect(parseTimeOfDay('9:30')).toBe(570);
  });

  it.each(['', '25:00', '10:60', 'noon', '10', '10:0'])('rejects %o', (raw) => {
    expect(parseTimeOfDay(raw)).toBeNull();
  });

  it('formats an empty time as blank', () => {
    expect(formatTimeOfDay(null)).toBe('');
  });
});

describe('default template', () => {
  it('starts the workday at 10:00', () => {
    const start = template().blocks.find((b) => b.id === 'work-start');
    expect(formatTimeOfDay(start?.startMinute ?? null)).toBe('10:00');
  });

  it('ends eight hours later', () => {
    const end = template().blocks.find((b) => b.id === 'work-end');
    expect(formatTimeOfDay(end?.startMinute ?? null)).toBe('18:00');
  });

  // Brief section 3: the nap comes before tea, as a transition tool.
  it('puts the nap before tea and the shower after it', () => {
    const ids = template().blocks.map((b) => b.id);
    expect(ids.indexOf('nap')).toBeLessThan(ids.indexOf('tea'));
    expect(ids.indexOf('tea')).toBeLessThan(ids.indexOf('shower'));
  });

  // Brief section 3: interview prep comes before project work by design.
  it('puts interview prep before project work', () => {
    const ids = template().blocks.map((b) => b.id);
    expect(ids.indexOf('interview-prep')).toBeLessThan(ids.indexOf('project-work'));
  });

  it('gives the nap a 20-minute cap and tea 10', () => {
    const blocks = template().blocks;
    expect(blocks.find((b) => b.id === 'nap')?.durationMinutes).toBe(20);
    expect(blocks.find((b) => b.id === 'tea')?.durationMinutes).toBe(10);
  });
});

describe('editing the template', () => {
  it('adds a block at the end', () => {
    const next = addBlock(template(), block('reading', 'Reading'), LATER);
    expect(next.blocks.at(-1)?.id).toBe('reading');
    expect(next.updatedAt).toBe(LATER);
  });

  it('renames a block', () => {
    const next = updateBlock(template(), 'tea', { name: 'Coffee' }, LATER);
    expect(next.blocks.find((b) => b.id === 'tea')?.name).toBe('Coffee');
  });

  it('changes a start time', () => {
    const next = updateBlock(template(), 'work-start', { startMinute: 9 * 60 }, LATER);
    expect(next.blocks.find((b) => b.id === 'work-start')?.startMinute).toBe(540);
  });

  it('removes a block', () => {
    const next = removeBlock(template(), 'gaming', LATER);
    expect(next.blocks.some((b) => b.id === 'gaming')).toBe(false);
  });

  it('never mutates the template it was given', () => {
    const original = template();
    const snapshot = JSON.stringify(original);
    addBlock(original, block('x'), LATER);
    updateBlock(original, 'tea', { name: 'Changed' }, LATER);
    removeBlock(original, 'tea', LATER);
    moveBlock(original, 'tea', 1, LATER);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('returns the same template when nothing matched', () => {
    const original = template();
    expect(updateBlock(original, 'missing', { name: 'x' }, LATER)).toBe(original);
    expect(removeBlock(original, 'missing', LATER)).toBe(original);
    expect(moveBlock(original, 'missing', 1, LATER)).toBe(original);
  });

  describe('reordering', () => {
    const three = (): RoutineTemplate => ({
      schemaVersion: 2,
      updatedAt: NOW,
      blocks: [block('a'), block('b'), block('c')],
    });

    it('moves a block up and down', () => {
      expect(moveBlock(three(), 'b', -1, LATER).blocks.map((b) => b.id)).toEqual(['b', 'a', 'c']);
      expect(moveBlock(three(), 'b', 1, LATER).blocks.map((b) => b.id)).toEqual(['a', 'c', 'b']);
    });

    it('clamps at the ends rather than wrapping', () => {
      expect(moveBlock(three(), 'a', -1, LATER).blocks.map((b) => b.id)).toEqual(['a', 'b', 'c']);
      expect(moveBlock(three(), 'c', 5, LATER).blocks.map((b) => b.id)).toEqual(['a', 'b', 'c']);
    });
  });
});

describe('snapshotRoutine', () => {
  it('copies every block with nothing completed', () => {
    const snapshot = snapshotRoutine(template());
    expect(snapshot).toHaveLength(template().blocks.length);
    expect(snapshot.every((b) => b.completedAt === null)).toBe(true);
  });

  // This is what makes template edits forward-only: the snapshot is a copy, so
  // later edits to the template cannot reach into it.
  it('is independent of the template it came from', () => {
    const original = template();
    const snapshot = snapshotRoutine(original);
    const edited = updateBlock(original, 'tea', { name: 'Coffee' }, LATER);

    expect(edited.blocks.find((b) => b.id === 'tea')?.name).toBe('Coffee');
    expect(snapshot.find((b) => b.id === 'tea')?.name).toBe('Tea');
  });
});

describe('block completion', () => {
  it('toggles on and off', () => {
    const snapshot = snapshotRoutine(template());
    const done = toggleBlockCompletion(snapshot, 'tea', NOW);
    expect(done.find((b) => b.id === 'tea')?.completedAt).toBe(NOW);

    const undone = toggleBlockCompletion(done, 'tea', LATER);
    expect(undone.find((b) => b.id === 'tea')?.completedAt).toBeNull();
  });

  it('touches only the named block', () => {
    const snapshot = snapshotRoutine(template());
    const done = toggleBlockCompletion(snapshot, 'tea', NOW);
    expect(completedBlockCount(done)).toBe(1);
  });

  it('does not mutate the array it was given', () => {
    const snapshot = snapshotRoutine(template());
    toggleBlockCompletion(snapshot, 'tea', NOW);
    expect(snapshot.find((b) => b.id === 'tea')?.completedAt).toBeNull();
  });
});
