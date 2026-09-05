export interface FirebaseConfig {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly storageBucket: string;
  readonly messagingSenderId: string;
  readonly appId: string;
}

/** Just the keys this reads — looser than Vite's `ImportMetaEnv` so tests can
 *  pass a plain object. */
export type FirebaseEnv = Partial<
  Record<
    | 'VITE_FIREBASE_API_KEY'
    | 'VITE_FIREBASE_AUTH_DOMAIN'
    | 'VITE_FIREBASE_PROJECT_ID'
    | 'VITE_FIREBASE_STORAGE_BUCKET'
    | 'VITE_FIREBASE_MESSAGING_SENDER_ID'
    | 'VITE_FIREBASE_APP_ID',
    string
  >
>;

/**
 * Reads the Firebase config from the build-time environment.
 *
 * Returns null when it is absent, which is a supported state rather than an
 * error: with no config the app runs entirely on the local store and the sync
 * layer stays dormant. That is what lets the whole app work before Firebase is
 * set up — and keeps it working if the project is ever removed.
 *
 * Deliberately free of any `firebase` import so that checking whether sync is
 * configured does not drag the SDK into the main bundle.
 */
export function readFirebaseConfig(env: FirebaseEnv = import.meta.env): FirebaseConfig | null {
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };

  const complete = Object.values(config).every(
    (value) => typeof value === 'string' && value.trim() !== '',
  );
  return complete ? (config as FirebaseConfig) : null;
}

/**
 * Loads the Firestore adapter, or null when Firebase is not configured.
 *
 * The SDK is imported dynamically so it is code-split into its own chunk: an
 * install with no Firebase set up never downloads it at all, and one that does
 * loads it after the app is already interactive. The app must start fast on a
 * connection that has just come back.
 */
export async function createRemoteAdapter(): Promise<import('./remote').RemoteAdapter | null> {
  const config = readFirebaseConfig();
  if (config === null) return null;
  try {
    const { FirebaseAdapter } = await import('./firebaseAdapter');
    return new FirebaseAdapter(config);
  } catch {
    // A malformed config or a failed chunk load must not stop the app.
    return null;
  }
}
