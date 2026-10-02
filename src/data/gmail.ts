import { GoogleAuthProvider, reauthenticateWithPopup, type Auth } from 'firebase/auth';
import type { Mailbox } from '../lib/emailSync';
import { toMailMessage, type GmailApiMessage } from '../lib/gmailMessage';

/**
 * Read-only Gmail for the signed-in member. Google asks once, in a popup opened from a tap, to let
 * Bills read mail; the access token lasts an hour and is kept for that hour so reopening the app
 * can check again without another popup. Nothing ever asks without a tap.
 */

export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const TOKEN_KEY = 'bills-gmail-token';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

declare global {
  interface Window {
    /** Browser tests set this to use a stubbed Gmail API (page.route) without a Google account. */
    __gmailTestToken?: string;
  }
}

interface StoredToken {
  uid: string;
  token: string;
  expires: number;
}

function readStored(uid: string): string | null {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as StoredToken | null;
    if (t && t.uid === uid && t.expires > Date.now()) return t.token;
  } catch {
    // ignore a malformed entry
  }
  return null;
}

export function forgetGmailToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** A token that is still valid, without asking anyone. */
export function storedGmailToken(auth: Auth): string | null {
  if (typeof window !== 'undefined' && window.__gmailTestToken) return window.__gmailTestToken;
  const user = auth.currentUser;
  return user ? readStored(user.uid) : null;
}

/** Asks Google for read-only Gmail access. Call only from a tap: browsers block popups otherwise. */
export async function requestGmailToken(auth: Auth): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in first.');
  const provider = new GoogleAuthProvider();
  provider.addScope(GMAIL_READONLY_SCOPE);
  if (user.email) provider.setCustomParameters({ login_hint: user.email });
  const result = await reauthenticateWithPopup(user, provider);
  const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if (!token) throw new Error('Google did not allow reading email.');
  // Google access tokens last an hour; stop using it a little early.
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ uid: user.uid, token, expires: Date.now() + 55 * 60_000 } satisfies StoredToken));
  return token;
}

export class GmailError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'GmailError';
  }
}

async function call<T>(token: string, path: string, params: Record<string, string | string[]>): Promise<T> {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) for (const one of Array.isArray(v) ? v : [v]) url.searchParams.append(k, one);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) forgetGmailToken();
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new GmailError(res.status === 401 ? 'Gmail access has ended; check email again to allow it.' : `Gmail answered ${res.status}: ${body.error?.message ?? res.statusText}`, res.status);
  }
  return (await res.json()) as T;
}

/** The member's Gmail through the REST API with a read-only token. */
export function gmailMailbox(token: string): Mailbox {
  return {
    async search(q, max) {
      const r = await call<{ messages?: { id: string }[] }>(token, 'messages', { q, maxResults: String(max) });
      return (r.messages ?? []).map((m) => m.id);
    },
    async get(id) {
      return toMailMessage(await call<GmailApiMessage>(token, `messages/${encodeURIComponent(id)}`, { format: 'full' }));
    },
    async headers(id) {
      const m = toMailMessage(await call<GmailApiMessage>(token, `messages/${encodeURIComponent(id)}`, { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] }));
      return { id: m.id, date: m.date, from: m.from, subject: m.subject };
    },
  };
}

/** Plain words for a failed check. */
export function gmailError(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Gmail was not connected.';
  if (code === 'auth/popup-blocked') return 'The browser blocked Google’s window. Allow popups for this site and try again.';
  if (e instanceof GmailError) return e.message;
  if (e instanceof TypeError) return "Couldn't reach Gmail. Check the connection.";
  return (e as Error)?.message || "Couldn't check email.";
}
