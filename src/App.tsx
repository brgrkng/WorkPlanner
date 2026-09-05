import { useState } from 'react';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { StoreProvider } from '@/app/StoreProvider';
import { SyncProvider } from '@/app/SyncProvider';
import { SyncStatus } from '@/app/SyncStatus';
import { WorkdaySurface } from '@/app/WorkdaySurface';
import { DashboardPanel } from '@/features/dashboard';
import { HabitsPanel } from '@/features/habits';
import { RoutinePanel } from '@/features/routine';
import { SettingsPanel } from '@/features/settings';
import { TimerPanel, TimerProvider } from '@/features/timer';
import styles from './App.module.css';

type View = 'dashboard' | 'today' | 'settings';

/**
 * The dashboard is the landing view (brief section 8); Today is one click away.
 *
 * The timer lives in TimerProvider, above both views, so switching views never
 * interrupts a running session.
 */
function Shell() {
  const [view, setView] = useState<View>('dashboard');

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <h1 className={styles.title}>WorkPlanner</h1>
          <SyncStatus />
        </div>
        <nav className={styles.viewTabs}>
          <button
            type="button"
            className={view === 'dashboard' ? styles.viewTabActive : styles.viewTab}
            aria-current={view === 'dashboard'}
            onClick={() => setView('dashboard')}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={view === 'today' ? styles.viewTabActive : styles.viewTab}
            aria-current={view === 'today'}
            onClick={() => setView('today')}
          >
            Today
          </button>
          <button
            type="button"
            className={view === 'settings' ? styles.viewTabActive : styles.viewTab}
            aria-current={view === 'settings'}
            onClick={() => setView('settings')}
          >
            Settings
          </button>
        </nav>
      </header>

      <div className={styles.stack}>
        {view === 'dashboard' ? <DashboardPanel /> : null}
        {view === 'settings' ? <SettingsPanel /> : null}
        {view === 'today' ? (
          <>
            <RoutinePanel />
            <WorkdaySurface>
              <TimerPanel />
            </WorkdaySurface>
            <HabitsPanel />
          </>
        ) : null}
      </div>
    </main>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <StoreProvider>
        <SyncProvider>
          <TimerProvider>
            <Shell />
          </TimerProvider>
        </SyncProvider>
      </StoreProvider>
    </ErrorBoundary>
  );
}
