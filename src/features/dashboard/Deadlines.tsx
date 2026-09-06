import { useState } from 'react';
import {
  daysUntil,
  deadlineStatus,
  parseDayKey,
  workdaysRemaining,
  type DayKey,
  type Deadline,
} from '@/domain';
import { Icon } from '@/ui';
import type { DashboardView } from './useDashboard';
import styles from './DashboardPanel.module.css';

function remainingLabel(deadline: Deadline, today: DayKey): string {
  const status = deadlineStatus(deadline, today);
  if (status === 'done') return 'done';
  if (status === 'today') return 'due today';

  const days = daysUntil(deadline.dueDate, today);
  if (days < 0) return `${Math.abs(days)}d overdue`;

  const workdays = workdaysRemaining(deadline.dueDate, today);
  return `${days}d left · ${workdays} workdays`;
}

/**
 * Deadlines and milestones (brief section 8).
 *
 * A proper editable list — the two seeded entries are a starting point, not a
 * fixed pair.
 */
export function Deadlines({ dashboard }: { readonly dashboard: DashboardView }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (title.trim() === '' || due === '') return;
    try {
      dashboard.createDeadline(title, parseDayKey(due));
    } catch {
      return; // The date input cannot normally produce an invalid key.
    }
    setTitle('');
    setDue('');
  };

  return (
    <div className={styles.deadlines}>
      <h3 className={styles.sectionTitle}>Deadlines</h3>

      <ul className={styles.deadlineList}>
        {dashboard.deadlines.map((deadline) => {
          const status = deadlineStatus(deadline, dashboard.today);
          return (
            <li key={deadline.id} className={styles.deadlineRow}>
              <input
                type="checkbox"
                checked={deadline.completed}
                aria-label={`Mark ${deadline.title} complete`}
                onChange={(event) =>
                  dashboard.editDeadline(deadline.id, { completed: event.target.checked })
                }
              />
              <input
                type="text"
                className={styles.deadlineTitle}
                value={deadline.title}
                aria-label={`Title of ${deadline.title}`}
                onChange={(event) =>
                  dashboard.editDeadline(deadline.id, { title: event.target.value })
                }
              />
              <input
                type="date"
                className={styles.deadlineDate}
                value={deadline.dueDate}
                aria-label={`Due date of ${deadline.title}`}
                onChange={(event) => {
                  if (event.target.value === '') return;
                  dashboard.editDeadline(deadline.id, {
                    dueDate: parseDayKey(event.target.value),
                  });
                }}
              />
              <span
                className={
                  status === 'overdue'
                    ? styles.overdue
                    : status === 'done'
                      ? styles.doneTag
                      : styles.muted
                }
              >
                {remainingLabel(deadline, dashboard.today)}
              </span>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={`Remove ${deadline.title}`}
                onClick={() => dashboard.deleteDeadline(deadline.id)}
              >
                <Icon name="close" />
              </button>
            </li>
          );
        })}
      </ul>

      <form className={styles.deadlineAdd} onSubmit={submit}>
        <input
          type="text"
          className={styles.deadlineTitle}
          placeholder="New deadline"
          aria-label="New deadline title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <input
          type="date"
          className={styles.deadlineDate}
          aria-label="New deadline date"
          value={due}
          onChange={(event) => setDue(event.target.value)}
        />
        <button type="submit" className={styles.secondary}>
          Add
        </button>
      </form>
    </div>
  );
}
