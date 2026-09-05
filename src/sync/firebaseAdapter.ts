import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type Auth,
} from 'firebase/auth';
import {
  CACHE_SIZE_UNLIMITED,
  collection,
  doc,
  getDocs,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import type { MetaSnapshot } from '@/store';
import type { FirebaseConfig } from './firebaseConfig';
import type { RemoteAdapter } from './remote';

const DAY_LOGS = 'dayLogs';
const META = 'meta';
const META_DOC = 'app';

/**
 * Firestore-backed implementation of the sync contract.
 *
 * Firestore's own offline persistence is enabled as a second line of defence:
 * the local IndexedDB store is still the app's source of truth, but this means
 * a write issued just before an outage is retried by the SDK as well.
 */
export class FirebaseAdapter implements RemoteAdapter {
  private readonly app: FirebaseApp;
  private readonly auth: Auth;
  private readonly db: Firestore;
  private uid: string | null = null;

  constructor(config: FirebaseConfig) {
    this.app = initializeApp(config);
    this.auth = getAuth(this.app);
    this.db = initializeFirestore(this.app, {
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager(undefined),
        cacheSizeBytes: CACHE_SIZE_UNLIMITED,
      }),
    });

    // Keep the session across restarts so an outage does not force a re-login.
    void setPersistence(this.auth, browserLocalPersistence).catch(() => {
      // Non-fatal: the app still works, sign-in just will not persist.
    });

    onAuthStateChanged(this.auth, (user) => {
      this.uid = user?.uid ?? null;
    });
  }

  currentUser(): string | null {
    return this.uid;
  }

  onUserChange(listener: (uid: string | null) => void): () => void {
    return onAuthStateChanged(this.auth, (user) => listener(user?.uid ?? null));
  }

  async signIn(email: string, password: string): Promise<string> {
    const credential = await signInWithEmailAndPassword(this.auth, email, password);
    this.uid = credential.user.uid;
    return this.uid;
  }

  async signOut(): Promise<void> {
    await firebaseSignOut(this.auth);
    this.uid = null;
  }

  async fetchDayLogs(uid: string): Promise<unknown[]> {
    const snapshot = await getDocs(collection(this.db, 'users', uid, DAY_LOGS));
    return snapshot.docs.map((document) => document.data());
  }

  async fetchMeta(uid: string): Promise<Partial<MetaSnapshot>> {
    const snapshot = await getDocs(collection(this.db, 'users', uid, META));
    const found = snapshot.docs.find((document) => document.id === META_DOC);
    return (found?.data() as Partial<MetaSnapshot> | undefined) ?? {};
  }

  async putDayLog(uid: string, dayKey: string, log: unknown): Promise<void> {
    await setDoc(doc(this.db, 'users', uid, DAY_LOGS, dayKey), log as object);
  }

  async putMeta(uid: string, meta: MetaSnapshot): Promise<void> {
    await setDoc(doc(this.db, 'users', uid, META, META_DOC), meta);
  }
}
