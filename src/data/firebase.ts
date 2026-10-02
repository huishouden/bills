import { getApps, initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, signInWithPopup, signOut } from 'firebase/auth';
import { firebaseConfigFromEnv } from '@huishouden/pwa-kit/firebase';
import { initFirestore } from '@huishouden/pwa-kit/firestore';
import { forgetSilentSignIn } from '@huishouden/pwa-kit/auth';
import { configureGoogleTokens } from '@huishouden/pwa-kit/google-token';

// From VITE_FIREBASE_* build variables: CI sets them from repo variables; locally `bun run env:pull`.
export const app = getApps()[0] ?? initializeApp(firebaseConfigFromEnv(import.meta.env));
// getAuth keeps the session in IndexedDB, so the tablet stays signed in across restarts.
export const auth = getAuth(app);
// Persistent cache: the app opens and accepts entries offline, and syncs when the network returns.
// Writes come from @huishouden/pwa-kit/firestore, so one made just before the app closes is kept.
export const db = initFirestore(app, { auth });
export const googleClientId: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined;
// Google API tokens come from Google Identity Services with this OAuth client, not from Firebase sign-in.
configureGoogleTokens({ clientId: googleClientId });

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}

export async function signOutEverywhere() {
  await forgetSilentSignIn();
  await signOut(auth);
}
