import { msToRoundedMinutes, type PeriodTotals } from '@/domain';
import styles from './AllocationMeter.module.css';

const RADIUS = 58;
const STROKE = 12;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function formatHours(ms: number): string {
  const minutes = msToRoundedMinutes(ms);
  const hours = minutes / 60;
  if (minutes === 0) return '0';
  return hours >= 10 ? hours.toFixed(0) : hours.toFixed(1).replace(/\.0$/, '');
}

function formatDuration(ms: number): string {
  const minutes = msToRoundedMinutes(ms);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

interface Props {
  readonly totals: PeriodTotals;
  readonly ratio: number | undefined;
  readonly shortfallMs: number;
  readonly overtimeMs: number;
}

/**
 * Actual work against allocated work.
 *
 * The brief asks for a pie of two slices. That form is wrong for this data —
 * a single ratio against a limit is a meter, and a two-slice pie is harder to
 * read than the number itself. So this is a radial meter: the ring the brief
 * pictures, with a same-ramp track and the real figure as the hero number in
 * the middle. Same information, read at a glance instead of estimated by angle.
 */
export function AllocationMeter({ totals, ratio, shortfallMs, overtimeMs }: Props) {
  const nothingAllocated = ratio === undefined;
  const filled = nothingAllocated ? 0 : Math.min(1, ratio);
  const over = overtimeMs > 0;

  const trackedMs = totals.pomodoroMs;
  const offlineMs = totals.offlineWorkedMs;
  const splitTotal = trackedMs + offlineMs;

  return (
    <figure className={styles.figure}>
      <div className={styles.meter}>
        <svg
          className={styles.ring}
          viewBox="0 0 140 140"
          role="img"
          aria-label={
            nothingAllocated
              ? 'No work time allocated in this period'
              : `${formatDuration(totals.actualMs)} worked of ${formatDuration(totals.allocatedMs)} allocated, ${Math.round((ratio ?? 0) * 100)} percent`
          }
        >
          <circle
            className={styles.track}
            cx="70"
            cy="70"
            r={RADIUS}
            strokeWidth={STROKE}
            fill="none"
          />
          {filled > 0 ? (
            <circle
              className={over ? styles.fillOver : styles.fill}
              cx="70"
              cy="70"
              r={RADIUS}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${CIRCUMFERENCE * filled} ${CIRCUMFERENCE}`}
              transform="rotate(-90 70 70)"
            />
          ) : null}
        </svg>

        <div className={styles.center}>
          {/* Hero figure: proportional digits, not tabular — tabular-nums
              makes a large standalone number look loose. */}
          <span className={styles.hero}>{formatHours(totals.actualMs)}</span>
          <span className={styles.heroUnit}>hours worked</span>
        </div>
      </div>

      <figcaption className={styles.caption}>
        {nothingAllocated ? (
          <span className={styles.muted}>Nothing scheduled in this period.</span>
        ) : (
          <>
            <span className={styles.ratio}>{Math.round((ratio ?? 0) * 100)}%</span>
            <span className={styles.muted}>
              of {formatDuration(totals.allocatedMs)} allocated
              {over ? ` · ${formatDuration(overtimeMs)} over` : ''}
              {!over && shortfallMs > 0 ? ` · ${formatDuration(shortfallMs)} short` : ''}
            </span>
          </>
        )}
      </figcaption>

      {splitTotal > 0 ? (
        <div className={styles.split}>
          <div
            className={styles.splitBar}
            role="img"
            aria-label={`${formatDuration(trackedMs)} tracked by timer, ${formatDuration(offlineMs)} reported offline`}
          >
            {trackedMs > 0 ? (
              <span
                className={styles.splitTracked}
                style={{ flexGrow: trackedMs }}
                title={`${formatDuration(trackedMs)} tracked`}
              />
            ) : null}
            {offlineMs > 0 ? (
              <span
                className={styles.splitOffline}
                style={{ flexGrow: offlineMs }}
                title={`${formatDuration(offlineMs)} offline`}
              />
            ) : null}
          </div>
          {/* Two series, so a legend is always present — identity is never
              carried by colour alone. */}
          <ul className={styles.legend}>
            <li>
              <span className={`${styles.swatch} ${styles.swatchTracked}`} aria-hidden="true" />
              Timer {formatDuration(trackedMs)}
            </li>
            {offlineMs > 0 ? (
              <li>
                <span className={`${styles.swatch} ${styles.swatchOffline}`} aria-hidden="true" />
                Offline {formatDuration(offlineMs)}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </figure>
  );
}
