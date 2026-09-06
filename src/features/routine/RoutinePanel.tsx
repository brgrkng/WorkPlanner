import { useState } from 'react';
import { formatTimeOfDay } from '@/domain';
import { useTimerContext } from '@/features/timer';
import { BlockCountdown } from './BlockCountdown';
import { RoutineEditor } from './RoutineEditor';
import { useRoutine } from './useRoutine';
import styles from './RoutinePanel.module.css';

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Today's routine.
 *
 * On Friday and Saturday this collapses to a minimal view with no schedule and
 * no work prompts (brief section 2) — those days are neutral, and the app must
 * not pressure work on them.
 */
export function RoutinePanel() {
  const routine = useRoutine();
  const timer = useTimerContext();
  const [editing, setEditing] = useState(false);

  if (routine.isOffDay) {
    return (
      <section className={styles.panel} aria-label="Today">
        <p className={styles.offDayTitle}>Off day.</p>
        <p className={styles.offDayNote}>
          No routine, no work block, nothing tracked against you today.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-label="Today's routine">
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Today</h2>
          <p className={styles.project}>Current project: {routine.currentProject}</p>
        </div>
        <button
          type="button"
          className={styles.link}
          onClick={() => setEditing((value) => !value)}
          aria-expanded={editing}
        >
          {editing ? 'Done editing' : 'Edit routine'}
        </button>
      </header>

      {editing ? (
        <RoutineEditor routine={routine} />
      ) : (
        <ol className={styles.blocks}>
          {routine.routine.map((block) => (
            <li
              key={block.id}
              className={block.id === timer.selectedTaskId ? styles.blockSelected : styles.block}
            >
              <div className={styles.blockLeft}>
                {/* The checkbox is the ONLY thing that ticks a block off. It is
                    not wrapped in a label around the name, because clicking the
                    name has to mean something else entirely. */}
                <input
                  type="checkbox"
                  checked={block.completedAt !== null}
                  aria-label={block.name}
                  onChange={() => routine.toggleBlock(block.id)}
                />
                {block.isWorkBlock ? (
                  /* A work block's name selects it as the timer's task. Same
                     state as the chips above the clock, shown where the day
                     actually is. It stretches across the row's free space so
                     clicking anywhere but the checkbox selects rather than
                     ticks. */
                  <button
                    type="button"
                    className={block.completedAt !== null ? styles.taskNameDone : styles.taskName}
                    aria-pressed={block.id === timer.selectedTaskId}
                    onClick={() => timer.selectTask(block.id)}
                  >
                    {block.name}
                  </button>
                ) : (
                  <span className={block.completedAt !== null ? styles.doneName : styles.name}>
                    {block.name}
                  </span>
                )}
              </div>
              <div className={styles.blockRight}>
                {block.id === timer.selectedTaskId ? (
                  <span className={styles.timerTag}>Timer</span>
                ) : null}
                {block.startMinute !== null ? (
                  <span className={styles.time}>{formatTimeOfDay(block.startMinute)}</span>
                ) : null}
                {block.durationMinutes !== null ? (
                  <BlockCountdown minutes={block.durationMinutes} />
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className={styles.lunch}>
        {routine.lunchRunning ? (
          <>
            <span className={styles.lunchClock}>{formatClock(routine.lunchRemainingMs)}</span>
            <span className={styles.lunchLabel}>Lunch — work paused</span>
            <button type="button" className={styles.secondary} onClick={routine.endLunch}>
              End lunch
            </button>
          </>
        ) : (
          <>
            <button type="button" className={styles.secondary} onClick={routine.startLunch}>
              Start lunch
            </button>
            <span className={styles.lunchLabel}>
              {routine.lunchMinutesToday > 0
                ? `${routine.lunchMinutesToday} min logged today — not counted against the 8 hours`
                : 'Up to 60 minutes, separate from the 8-hour window'}
            </span>
          </>
        )}
      </div>

      <div className={styles.selfReport}>
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={routine.sleepDebt}
            onChange={(event) => routine.setSleepDebt(event.target.checked)}
          />
          <span>Broken sleep last night</span>
        </label>
        <input
          type="text"
          className={styles.noteInput}
          placeholder="Note for today (optional)"
          value={routine.note}
          onChange={(event) => routine.setNote(event.target.value)}
          aria-label="Note for today"
        />
      </div>
    </section>
  );
}
