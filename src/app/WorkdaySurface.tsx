import { useState, type ReactNode } from 'react';
import { isOffDay } from '@/domain';
import { useStore, useStoreVersion } from './storeContext';
import styles from './WorkdaySurface.module.css';

/**
 * Hides the work timer on Friday and Saturday.
 *
 * Brief section 2 is explicit that off days must not show the workday timer UI
 * and must not pressure work. But hiding it outright would make weekend work
 * impossible to log, and work actually done still counts toward actual time
 * (SESSION.md decision 9). So the timer is off by default and available behind
 * one deliberate click: no prompt, no nudge, no default-on affordance.
 */
export function WorkdaySurface({ children }: { readonly children: ReactNode }) {
  const store = useStore();
  useStoreVersion();
  const [revealed, setRevealed] = useState(false);

  if (!isOffDay(store.today()) || revealed) return <>{children}</>;

  return (
    <p className={styles.offDay}>
      <button type="button" className={styles.link} onClick={() => setRevealed(true)}>
        Work anyway
      </button>
      <span className={styles.note}>Nothing is expected of you today.</span>
    </p>
  );
}
