import { StoreProvider } from '@/app/StoreProvider';
import { RoutinePanel } from '@/features/routine';
import { TimerPanel, TimerProvider } from '@/features/timer';
import { WorkdaySurface } from '@/app/WorkdaySurface';
import styles from './App.module.css';

export function App() {
  return (
    <StoreProvider>
      <TimerProvider>
        <main className={styles.main}>
          <header className={styles.header}>
            <h1 className={styles.title}>WorkPlanner</h1>
          </header>
          <div className={styles.stack}>
            <RoutinePanel />
            <WorkdaySurface>
              <TimerPanel />
            </WorkdaySurface>
          </div>
        </main>
      </TimerProvider>
    </StoreProvider>
  );
}
