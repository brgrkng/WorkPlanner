import { useEffect, useState } from 'react';
import styles from './RoutinePanel.module.css';

const TICK_MS = 1_000;

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * A silent countdown for a routine block — the nap, tea, and anything else the
 * user gives a duration.
 *
 * Silent is deliberate and total: no sound, no notification (SESSION.md
 * decision 3). Reaching zero only changes what is on screen. State is
 * in-memory: a 20-minute nap timer is not worth persisting through a crash,
 * and the day's real accounting lives in the work timer.
 */
export function BlockCountdown({ minutes }: { readonly minutes: number }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (startedAt === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [startedAt]);

  if (startedAt === null) {
    return (
      <button type="button" className={styles.countdownStart} onClick={() => setStartedAt(Date.now())}>
        {minutes} min
      </button>
    );
  }

  const remaining = minutes * 60_000 - (now - startedAt);
  const done = remaining <= 0;

  return (
    <span className={styles.countdownRunning}>
      <span className={done ? styles.countdownDone : styles.countdownClock}>
        {done ? 'done' : formatClock(remaining)}
      </span>
      <button type="button" className={styles.countdownStop} onClick={() => setStartedAt(null)}>
        Reset
      </button>
    </span>
  );
}
