import { useState } from 'react';
import { Icon } from '@/ui';
import type { HabitsView } from './useHabits';
import styles from './HabitsPanel.module.css';

/**
 * Manual outage self-report (brief section 5).
 *
 * There is no way to detect an outage after the fact, so the app does not try
 * to infer one. Reporting a stretch as not worked is recorded plainly and
 * contributes to nothing — no warning colour, no commentary.
 */
export function OutageReport({ habits }: { readonly habits: HabitsView }) {
  const [minutes, setMinutes] = useState('60');
  const [note, setNote] = useState('');

  const submit = (worked: boolean) => {
    habits.reportOutage(Number(minutes), worked, note);
    setMinutes('60');
    setNote('');
  };

  return (
    <div className={styles.outage}>
      <span className={styles.label}>Report an offline stretch</span>

      <div className={styles.outageForm}>
        <label className={styles.inlineField}>
          <input
            type="number"
            min="1"
            className={styles.minutes}
            value={minutes}
            aria-label="Minutes offline"
            onChange={(event) => setMinutes(event.target.value)}
          />
          <span className={styles.unit}>min</span>
        </label>

        <input
          type="text"
          className={styles.noteInput}
          placeholder="Note (optional)"
          value={note}
          aria-label="Outage note"
          onChange={(event) => setNote(event.target.value)}
        />

        <button type="button" className={styles.secondary} onClick={() => submit(true)}>
          Worked offline
        </button>
        <button type="button" className={styles.secondary} onClick={() => submit(false)}>
          Didn&apos;t work
        </button>
      </div>

      {habits.reports.length > 0 ? (
        <ul className={styles.reportList}>
          {habits.reports.map((report) => (
            <li key={report.id} className={styles.reportItem}>
              <span className={report.worked ? styles.reportWorked : styles.reportIdle}>
                {report.minutes} min {report.worked ? 'worked offline' : 'not worked'}
              </span>
              {report.note !== '' ? <span className={styles.reportNote}>{report.note}</span> : null}
              <button
                type="button"
                className={styles.iconButton}
                aria-label={`Remove ${report.minutes} minute report`}
                onClick={() => habits.deleteReport(report.id)}
              >
                <Icon name="close" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
