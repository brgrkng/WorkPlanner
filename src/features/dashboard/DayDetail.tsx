import {
  actualWorkedMs,
  msToRoundedMinutes,
  isOffDay,
  type DayKey,
  type DayLog,
} from '@/domain';
import styles from './DashboardPanel.module.css';

function formatDuration(ms: number): string {
  const minutes = msToRoundedMinutes(ms);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function formatTime(epochMs: number): string {
  const date = new Date(epochMs);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

interface Props {
  readonly dayKey: DayKey;
  readonly log: DayLog | undefined;
  readonly onExcusedChange: (dayKey: DayKey, value: boolean) => void;
}

/**
 * Drill-down for a single day.
 *
 * Renders entirely from the day's stored log — including its own routine
 * snapshot — so a past day always shows what actually happened, never what the
 * current template says (brief section 7).
 */
export function DayDetail({ dayKey, log, onExcusedChange }: Props) {
  if (log === undefined) {
    return (
      <div className={styles.detail}>
        <p className={styles.muted}>
          Nothing logged on this day.
          {isOffDay(dayKey) ? ' It was an off day.' : ''}
        </p>
        {!isOffDay(dayKey) ? (
          <label className={styles.excuseRow}>
            <input
              type="checkbox"
              checked={false}
              onChange={(event) => onExcusedChange(dayKey, event.target.checked)}
            />
            <span>Excuse this day</span>
          </label>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.detail}>
      <div className={styles.detailHead}>
        <span className={styles.detailTotal}>{formatDuration(actualWorkedMs(log))} worked</span>
        {log.sleepDebt ? <span className={styles.tag}>broken sleep</span> : null}
        {log.excused ? <span className={styles.tag}>excused</span> : null}
      </div>

      {log.note !== '' ? <p className={styles.note}>{log.note}</p> : null}

      {log.workSessions.length > 0 ? (
        <ul className={styles.sessionList}>
          {log.workSessions.map((session) => (
            <li key={session.id}>
              <span className={styles.sessionTime}>{formatTime(session.startedAt)}</span>
              <span>{formatDuration(session.endedAt - session.startedAt - session.pausedMs)}</span>
              <span className={styles.muted}>
                {session.taskName !== '' ? `${session.taskName} · ` : ''}
                {session.distractionFree === 'yes'
                  ? 'focused'
                  : session.distractionFree === 'no'
                    ? 'distracted'
                    : 'not answered'}
                {session.recovered ? ' · recovered' : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {log.offlineReports.length > 0 ? (
        <ul className={styles.sessionList}>
          {log.offlineReports.map((report) => (
            <li key={report.id}>
              <span className={styles.sessionTime}>offline</span>
              <span>{report.minutes}m</span>
              <span className={styles.muted}>
                {report.worked ? 'worked' : 'not worked'}
                {report.note !== '' ? ` · ${report.note}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {log.routine.length > 0 ? (
        <p className={styles.muted}>
          Routine: {log.routine.filter((b) => b.completedAt !== null).length} of{' '}
          {log.routine.length} blocks done
        </p>
      ) : null}

      {!isOffDay(dayKey) ? (
        <label className={styles.excuseRow}>
          <input
            type="checkbox"
            checked={log.excused}
            onChange={(event) => onExcusedChange(dayKey, event.target.checked)}
          />
          <span>Excuse this day</span>
        </label>
      ) : null}
    </div>
  );
}
