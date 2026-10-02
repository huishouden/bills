import { getApps, initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, signInWithPopup, signOut } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { firebaseConfigFromEnv } from '@huishouden/pwa-kit/firebase';
import { forgetSilentSignIn } from '@huishouden/pwa-kit/auth';

// From VITE_FIREBASE_* build variables: CI sets them from repo variables; locally `bun run env:pull`.
export const app = getApps()[0] ?? initializeApp(firebaseConfigFromEnv(import.meta.env));
// getAuth keeps the session in IndexedDB, so the tablet stays signed in across restarts.
export const auth = getAuth(app);
// Persistent cache: the log opens and accepts entries offline, and syncs when the network returns.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const googleClientId: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined;

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}

export async function signOutEverywhere() {
  await forgetSilentSignIn();
  await signOut(auth);
}
