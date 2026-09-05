import { SCHEMA_VERSION } from './constants';

/**
 * A block in the daily routine.
 *
 * `startMinute` is minutes after local midnight, or null for a block with no
 * fixed time (lunch, and anything the user does "whenever"). Array order — not
 * the clock — is authoritative for display, so untimed blocks still sit in the
 * right place in the sequence.
 */
export interface RoutineBlock {
  readonly id: string;
  readonly name: string;
  readonly startMinute: number | null;
  /** Offers a silent visual countdown of this length; null means no timer. */
  readonly durationMinutes: number | null;
  readonly note: string;
  /**
   * Whether this is work inside the 8-hour block, and so selectable as the
   * task the pomodoro timer is tracking.
   *
   * An explicit flag rather than inferring position between "workday start" and
   * "workday end": blocks can be renamed, reordered and deleted, so position
   * would silently stop meaning what it did.
   */
  readonly isWorkBlock: boolean;
}

export interface RoutineTemplate {
  readonly schemaVersion: number;
  readonly blocks: readonly RoutineBlock[];
  readonly updatedAt: number;
}

/**
 * A block as it existed on a particular day, plus whether it was done.
 *
 * Copied into each DayLog at creation. This is what makes template edits
 * forward-only (brief section 7): a past day renders from its own snapshot and
 * is untouched by any later change to the template.
 */
export interface RoutineBlockSnapshot {
  readonly id: string;
  readonly name: string;
  readonly startMinute: number | null;
  readonly durationMinutes: number | null;
  readonly completedAt: number | null;
  readonly isWorkBlock: boolean;
}

export const MINUTES_PER_DAY = 24 * 60;

export function parseTimeOfDay(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (match === null) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatTimeOfDay(startMinute: number | null): string {
  if (startMinute === null) return '';
  const normalized = ((startMinute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * The starting routine, from brief section 3. Every part of it is editable;
 * these are only the defaults a fresh install begins with.
 *
 * The morning block before the nap is a single untracked entry on purpose —
 * the brief says the app does not need to manage that part of the day.
 */
export function defaultRoutineTemplate(now: number): RoutineTemplate {
  const block = (
    id: string,
    name: string,
    startMinute: number | null,
    durationMinutes: number | null,
    note = '',
    isWorkBlock = false,
  ): RoutineBlock => ({ id, name, startMinute, durationMinutes, note, isWorkBlock });

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: now,
    blocks: [
      block('wake', 'Wake, skincare, coffee, gym', null, null, 'Not tracked in detail'),
      block('nap', 'Transition nap', null, 20, 'Straight after the gym, before tea'),
      block('tea', 'Tea', null, 10, ''),
      block('shower', 'Shower', null, null, ''),
      block('work-start', 'Workday start', 10 * 60, null, '8-hour work window'),
      block('interview-prep', 'Interview prep', null, null, 'Leetcode and study — comes first', true),
      block('project-work', 'Project work', null, null, '', true),
      block('work-end', 'Workday end', 18 * 60, null, 'Lunch is additional to the 8 hours'),
      block('gaming', 'Gaming', null, null, 'Not tracked'),
      block('wind-down', 'PM skincare, wind-down, sleep', null, null, 'Not tracked in detail'),
    ],
  };
}

export function snapshotRoutine(template: RoutineTemplate): RoutineBlockSnapshot[] {
  return template.blocks.map((block) => ({
    id: block.id,
    name: block.name,
    startMinute: block.startMinute,
    durationMinutes: block.durationMinutes,
    completedAt: null,
    isWorkBlock: block.isWorkBlock,
  }));
}

// --- template editing (all pure, all returning new templates) ----------------

export function addBlock(
  template: RoutineTemplate,
  block: RoutineBlock,
  now: number,
): RoutineTemplate {
  return { ...template, blocks: [...template.blocks, block], updatedAt: now };
}

export function updateBlock(
  template: RoutineTemplate,
  blockId: string,
  patch: Partial<Omit<RoutineBlock, 'id'>>,
  now: number,
): RoutineTemplate {
  let changed = false;
  const blocks = template.blocks.map((block) => {
    if (block.id !== blockId) return block;
    changed = true;
    return { ...block, ...patch };
  });
  return changed ? { ...template, blocks, updatedAt: now } : template;
}

export function removeBlock(
  template: RoutineTemplate,
  blockId: string,
  now: number,
): RoutineTemplate {
  const blocks = template.blocks.filter((block) => block.id !== blockId);
  if (blocks.length === template.blocks.length) return template;
  return { ...template, blocks, updatedAt: now };
}

/** Moves a block by `delta` positions, clamped to the ends. */
export function moveBlock(
  template: RoutineTemplate,
  blockId: string,
  delta: number,
  now: number,
): RoutineTemplate {
  const from = template.blocks.findIndex((block) => block.id === blockId);
  if (from === -1) return template;

  const to = Math.min(Math.max(from + delta, 0), template.blocks.length - 1);
  if (to === from) return template;

  const blocks = [...template.blocks];
  const [moved] = blocks.splice(from, 1);
  if (moved === undefined) return template;
  blocks.splice(to, 0, moved);
  return { ...template, blocks, updatedAt: now };
}

// --- per-day completion ------------------------------------------------------

export function toggleBlockCompletion(
  routine: readonly RoutineBlockSnapshot[],
  blockId: string,
  now: number,
): RoutineBlockSnapshot[] {
  return routine.map((block) =>
    block.id === blockId
      ? { ...block, completedAt: block.completedAt === null ? now : null }
      : block,
  );
}

export function completedBlockCount(routine: readonly RoutineBlockSnapshot[]): number {
  return routine.filter((block) => block.completedAt !== null).length;
}

/** The blocks the timer can be pointed at — work inside the 8-hour window. */
export function workBlocks(
  routine: readonly RoutineBlockSnapshot[],
): readonly RoutineBlockSnapshot[] {
  return routine.filter((block) => block.isWorkBlock);
}

/** The task to start on by default: the first work block of the day. */
export function defaultTask(
  routine: readonly RoutineBlockSnapshot[],
): RoutineBlockSnapshot | undefined {
  return workBlocks(routine)[0];
}
