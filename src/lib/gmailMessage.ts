import type { MailMessage } from './emailSync';

/** The parts of the Gmail API's `users.messages.get` answer that Bills reads. */
export interface GmailPart {
  mimeType?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}

export interface GmailApiMessage {
  id: string;
  internalDate?: string;
  payload?: GmailPart;
}

/** base64url (Gmail's encoding of part bodies) to UTF-8 text. */
export function decodeBase64Url(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(data.length / 4) * 4, '=');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

export function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function header(part: GmailPart | undefined, name: string): string {
  return part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

/** The first text/plain and text/html bodies, depth first (attachments have no inline data). */
function bodies(part: GmailPart | undefined, out: { text?: string; html?: string } = {}) {
  if (!part) return out;
  const type = (part.mimeType ?? '').toLowerCase();
  if (part.body?.data) {
    if (type === 'text/plain' && out.text === undefined) out.text = decodeBase64Url(part.body.data);
    if (type === 'text/html' && out.html === undefined) out.html = decodeBase64Url(part.body.data);
  }
  for (const p of part.parts ?? []) bodies(p, out);
  return out;
}

export function toMailMessage(m: GmailApiMessage): MailMessage {
  const p = m.payload;
  const date = Number(m.internalDate) || Date.parse(header(p, 'Date')) || 0;
  return { id: m.id, date, from: header(p, 'From'), subject: header(p, 'Subject'), ...bodies(p) };
}
