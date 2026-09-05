import { useState } from 'react';
import type { HabitsView } from './useHabits';
import styles from './HabitsPanel.module.css';

/**
 * The user's own list of things doable with no power or internet.
 *
 * Nothing here is fetched or generated — anything requiring a network would be
 * useless in exactly the situation the list exists for (brief section 5).
 */
export function OfflineTaskList({ habits }: { readonly habits: HabitsView }) {
  const [draft, setDraft] = useState('');

  return (
    <div className={styles.tasks}>
      <ul className={styles.taskList}>
        {habits.offlineTasks.map((task) => (
          <li key={task.id} className={styles.taskItem}>
            <input
              type="text"
              className={styles.taskInput}
              value={task.text}
              aria-label={`Offline task: ${task.text}`}
              onChange={(event) => habits.editTask(task.id, event.target.value)}
            />
            <button
              type="button"
              className={styles.iconButton}
              aria-label={`Remove offline task: ${task.text}`}
              onClick={() => habits.deleteTask(task.id)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <form
        className={styles.taskAdd}
        onSubmit={(event) => {
          event.preventDefault();
          habits.addTask(draft);
          setDraft('');
        }}
      >
        <input
          type="text"
          className={styles.taskInput}
          value={draft}
          placeholder="Add a fallback task"
          aria-label="New offline task"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className={styles.secondary}>
          Add
        </button>
      </form>
    </div>
  );
}
