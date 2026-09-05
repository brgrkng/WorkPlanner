import { useState } from 'react';
import { useHabits } from './useHabits';
import { OutageReport } from './OutageReport';
import { OfflineTaskList } from './OfflineTaskList';
import styles from './HabitsPanel.module.css';

/**
 * Cigarette counter, outage self-reporting, offline fallback tasks, and the
 * excused-day marker.
 *
 * Tone matters here more than anywhere else in the app: the counter has no
 * intervention prompts (brief section 6.1), and a reported non-working stretch
 * produces no scolding of any kind (brief section 5). These controls exist to
 * make honesty cheap.
 */
export function HabitsPanel() {
  const habits = useHabits();
  const [showTasks, setShowTasks] = useState(false);

  return (
    <section className={styles.panel} aria-label="Habits and outages">
      <div className={styles.row}>
        <div className={styles.counter}>
          <span className={styles.label}>Cigarettes today</span>
          <div className={styles.counterControls}>
            <button
              type="button"
              className={styles.step}
              aria-label="One fewer cigarette"
              onClick={() => habits.adjustCigarettes(-1)}
              disabled={habits.cigarettes === 0}
            >
              −
            </button>
            <input
              type="number"
              min="0"
              className={styles.count}
              value={habits.cigarettes}
              aria-label="Cigarettes today"
              onChange={(event) => habits.setCigarettes(Number(event.target.value))}
            />
            <button
              type="button"
              className={styles.step}
              aria-label="One more cigarette"
              onClick={() => habits.adjustCigarettes(1)}
            >
              +
            </button>
          </div>
        </div>

        <div className={styles.streak}>
          <span className={styles.label}>Clean streak</span>
          <span className={styles.streakValue}>
            {habits.cigaretteStreak.current}
            <span className={styles.streakUnit}>
              {habits.cigaretteStreak.current === 1 ? ' day' : ' days'}
            </span>
          </span>
          {habits.cigaretteStreak.longest > habits.cigaretteStreak.current ? (
            <span className={styles.streakBest}>best {habits.cigaretteStreak.longest}</span>
          ) : null}
        </div>
      </div>

      <OutageReport habits={habits} />

      <div className={styles.tasksSection}>
        <button
          type="button"
          className={styles.link}
          onClick={() => setShowTasks((value) => !value)}
          aria-expanded={showTasks}
        >
          {showTasks ? 'Hide offline tasks' : 'Offline fallback tasks'}
        </button>
        {!showTasks && habits.suggestedTask !== undefined ? (
          <span className={styles.suggestion}>
            If the power goes: {habits.suggestedTask.text}
          </span>
        ) : null}
      </div>

      {showTasks ? <OfflineTaskList habits={habits} /> : null}

      {!habits.isOffDay ? (
        <label className={styles.excused}>
          <input
            type="checkbox"
            checked={habits.excused}
            onChange={(event) => habits.setExcused(habits.today, event.target.checked)}
          />
          <span>
            Excuse today
            <span className={styles.excusedNote}>
              Sick, travelling, or a full-day outage. Skipped by streaks and left out of the
              allocated-vs-actual math entirely.
            </span>
          </span>
        </label>
      ) : null}
    </section>
  );
}
