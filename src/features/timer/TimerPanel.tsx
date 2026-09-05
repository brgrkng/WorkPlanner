import { msToRoundedMinutes } from '@/domain';
import { useTimer } from './useTimer';
import styles from './TimerPanel.module.css';

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(Math.abs(ms) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatDuration(ms: number): string {
  const minutes = msToRoundedMinutes(ms);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * The timer. Deliberately silent — no sound, no notifications (SESSION.md
 * decision 3) — so every state change has to be legible at a glance.
 *
 * Nothing here blocks: a break can be skipped, a session can run past its
 * interval, and the honesty check-in can be ignored (brief section 4).
 */
export function TimerPanel() {
  const timer = useTimer();
  const { state } = timer;
  const overtime = timer.remainingMs < 0;

  return (
    <section className={styles.panel} aria-label="Pomodoro timer">
      {timer.recoveredMs !== null ? (
        <div className={styles.notice} role="status">
          <span>
            Recovered {formatDuration(timer.recoveredMs)} from an interrupted session — already
            counted toward today.
          </span>
          <button type="button" className={styles.link} onClick={timer.dismissRecovery}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className={styles.readout}>
        <div
          className={`${styles.clock} ${overtime ? styles.clockOvertime : ''}`}
          aria-live="off"
        >
          {state.phase === 'idle'
            ? formatClock(timer.targetMs)
            : formatClock(Math.abs(timer.remainingMs))}
        </div>
        <div className={styles.status}>
          {state.phase === 'idle' ? 'Ready' : null}
          {state.phase === 'work' && !timer.paused ? (overtime ? 'Overtime' : 'Working') : null}
          {state.phase === 'work' && timer.paused ? 'Paused' : null}
          {state.phase === 'break'
            ? `${state.breakKind === 'long' ? 'Long' : 'Short'} break${overtime ? ' — over' : ''}`
            : null}
        </div>
      </div>

      <div className={styles.controls}>
        {state.phase === 'idle' ? (
          <button type="button" className={styles.primary} onClick={timer.start}>
            Start work
          </button>
        ) : null}

        {state.phase === 'work' ? (
          <>
            <button type="button" className={styles.secondary} onClick={timer.pauseResume}>
              {timer.paused ? 'Resume' : 'Pause'}
            </button>
            <button type="button" className={styles.primary} onClick={timer.stop}>
              Stop
            </button>
          </>
        ) : null}

        {state.phase === 'break' ? (
          <>
            <button type="button" className={styles.secondary} onClick={timer.finishBreak}>
              End break
            </button>
            <button type="button" className={styles.primary} onClick={timer.start}>
              Back to work
            </button>
          </>
        ) : null}
      </div>

      {/* The break is offered, never imposed: "Start work" stays available. */}
      {state.phase === 'idle' && timer.pendingCheckIn !== null ? (
        <div className={styles.suggestion}>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => timer.beginBreak()}
          >
            Take a {timer.suggestedBreak === 'long' ? 'long' : 'short'} break
          </button>
        </div>
      ) : null}

      {timer.pendingCheckIn !== null ? (
        <div className={styles.checkIn}>
          <span className={styles.checkInLabel}>Stayed off YouTube and socials that block?</span>
          <div className={styles.checkInActions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => timer.answerCheckIn('yes')}
            >
              Yes
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => timer.answerCheckIn('no')}
            >
              No
            </button>
            <button type="button" className={styles.link} onClick={timer.dismissCheckIn}>
              Skip
            </button>
          </div>
        </div>
      ) : null}

      <dl className={styles.meta}>
        <div className={styles.metaItem}>
          <dt>Pomodoros today</dt>
          <dd>{timer.completedToday}</dd>
        </div>
        <div className={styles.metaItem}>
          <dt>Until long break</dt>
          <dd>{timer.untilLongBreak}</dd>
        </div>
        {timer.pausedMs > 0 ? (
          <div className={styles.metaItem}>
            <dt>Paused</dt>
            <dd>{formatDuration(timer.pausedMs)}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
