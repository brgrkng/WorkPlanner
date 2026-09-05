import { describe, expect, it } from 'vitest';
import { readFirebaseConfig } from './firebaseConfig';

const complete = {
  VITE_FIREBASE_API_KEY: 'key',
  VITE_FIREBASE_AUTH_DOMAIN: 'app.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'app',
  VITE_FIREBASE_STORAGE_BUCKET: 'app.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '1',
  VITE_FIREBASE_APP_ID: '1:1:web:1',
};

describe('readFirebaseConfig', () => {
  it('reads a complete config', () => {
    expect(readFirebaseConfig(complete)?.projectId).toBe('app');
  });

  // The state the app ships in before Firebase is set up. Returning null here
  // is what keeps the app fully usable with no backend at all.
  it('is null when nothing is configured', () => {
    expect(readFirebaseConfig({})).toBeNull();
  });

  it('is null when the config is only partly filled in', () => {
    const { VITE_FIREBASE_APP_ID: _omitted, ...partial } = complete;
    expect(readFirebaseConfig(partial)).toBeNull();
  });

  // Unset GitHub secrets produce empty strings, not missing keys.
  it('treats empty strings as unconfigured', () => {
    expect(readFirebaseConfig({ ...complete, VITE_FIREBASE_API_KEY: '' })).toBeNull();
    expect(readFirebaseConfig({ ...complete, VITE_FIREBASE_PROJECT_ID: '   ' })).toBeNull();
  });
});
