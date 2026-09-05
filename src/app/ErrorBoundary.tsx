import { Component, type ErrorInfo, type ReactNode } from 'react';
import styles from './ErrorBoundary.module.css';

interface Props {
  readonly children: ReactNode;
}

interface State {
  readonly error: Error | null;
}

/**
 * Keeps a render crash from blanking the whole app.
 *
 * Reliability is the top requirement, and an unhandled render error would
 * otherwise leave a white page with no way back. Nothing here touches stored
 * data: the day logs are already in IndexedDB and the timer's heartbeat is
 * already in localStorage, so reloading recovers everything including an
 * in-progress session.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Console only — there is no error-reporting service, and adding one would
    // mean sending this user's data somewhere.
    console.error('WorkPlanner crashed while rendering', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    return (
      <div className={styles.wrap} role="alert">
        <h1 className={styles.title}>Something broke while drawing the page.</h1>
        <p className={styles.body}>
          Your data is safe — today&apos;s log is already saved locally, and a running timer will
          be picked up again when the page reloads.
        </p>
        <button type="button" className={styles.button} onClick={() => window.location.reload()}>
          Reload
        </button>
        <pre className={styles.detail}>{error.message}</pre>
      </div>
    );
  }
}
