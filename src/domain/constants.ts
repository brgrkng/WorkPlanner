/**
 * Tunable constants for the accountability math. These are defaults; anything
 * the user can change at runtime lives in Settings and is snapshotted into each
 * DayLog so that editing a setting never rewrites history (brief section 7).
 */

/** A logical day runs 04:00 -> 03:59 local. Work past midnight belongs to the
 *  day it started on. See SESSION.md decision 5. */
export const ROLLOVER_HOUR = 4;

/** A workday is "successful" for streak purposes at 6h of actual work. */
export const WORK_STREAK_THRESHOLD_MINUTES = 6 * 60;

/** The scheduled workday: 8h, excluding lunch (brief section 3). */
export const DEFAULT_ALLOCATED_MINUTES_PER_WORKDAY = 8 * 60;

export const DEFAULT_WORK_INTERVAL_MINUTES = 25;
export const DEFAULT_SHORT_BREAK_MINUTES = 5;
export const DEFAULT_LONG_BREAK_MINUTES = 20;
export const DEFAULT_LONG_BREAK_EVERY = 4;

/** Lunch is capped at 60 minutes (brief section 3). */
export const MAX_LUNCH_MINUTES = 60;

/** The transition nap is alarm-capped at 20 minutes — visual only, no sound. */
export const NAP_MINUTES = 20;

export const MS_PER_MINUTE = 60_000;

/** Bumped whenever the persisted shape changes, so migrations can be written. */
export const SCHEMA_VERSION = 1;
