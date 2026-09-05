import { StoreProvider } from '@/app/StoreProvider';
import { TimerPanel } from '@/features/timer';
import styles from './App.module.css';

export function App() {
  return (
    <StoreProvider>
      <main className={styles.main}>
        <header className={styles.header}>
          <h1 className={styles.title}>WorkPlanner</h1>
        </header>
        <TimerPanel />
      </main>
    </StoreProvider>
  );
}
