import { useState } from 'react';
import { useSyncEngine, useSyncStatus } from './syncContext';
import styles from './SyncStatus.module.css';

function relativeTime(timestamp: number | null): string {
  if (timestamp === null) return 'not yet';
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

/**
 * Backup status, kept deliberately quiet.
 *
 * Being offline is a normal state here, not a fault, so it is reported in the
 * same muted tone as everything else. Only a genuine error is highlighted, and
 * even then the message says the local data is safe — because it is.
 */
export function SyncStatus() {
  const engine = useSyncEngine();
  const status = useSyncStatus();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [open, setOpen] = useState(false);

  // Nothing configured: the app is local-only and says so once, quietly.
  if (status.phase === 'disabled') {
    return <span className={styles.muted}>Local only</span>;
  }

  if (status.phase === 'signed-out') {
    if (!open) {
      return (
        <button type="button" className={styles.link} onClick={() => setOpen(true)}>
          Sign in to back up
        </button>
      );
    }
    return (
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (engine === null) return;
          setSigningIn(true);
          void engine
            .signIn(email, password)
            .then(() => {
              setOpen(false);
              setPassword('');
            })
            .catch(() => undefined)
            .finally(() => setSigningIn(false));
        }}
      >
        <input
          type="email"
          className={styles.input}
          placeholder="email"
          aria-label="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <input
          type="password"
          className={styles.input}
          placeholder="password"
          aria-label="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" className={styles.button} disabled={signingIn}>
          {signingIn ? '…' : 'Sign in'}
        </button>
        {status.message !== null ? (
          <span className={styles.error}>{status.message}</span>
        ) : null}
      </form>
    );
  }

  const pending = status.pendingCount > 0 ? ` · ${status.pendingCount} pending` : '';

  return (
    <span className={styles.status}>
      {status.phase === 'syncing' ? <span className={styles.muted}>Syncing…</span> : null}
      {status.phase === 'idle' ? (
        <span className={styles.muted}>Backed up {relativeTime(status.lastSyncedAt)}</span>
      ) : null}
      {status.phase === 'offline' ? (
        <span className={styles.muted}>Offline{pending}</span>
      ) : null}
      {status.phase === 'error' ? (
        <span className={styles.error} title={status.message ?? undefined}>
          Backup failed{pending} — your data is safe locally
        </span>
      ) : null}
    </span>
  );
}
