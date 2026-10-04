import { CONTACT_PAY_KINDS, type Contact, type ContactPay, type ContactPayKind } from '@huishouden/pwa-kit/contact-core';
import type { PayMethod } from './model';

// Filling in how a bill is paid from its payee: the Zelle phone or email, the Venmo @handle, the
// mailing address for a check, the portal's link. What a bill saves is remembered on the contact
// (kit `Contact.pay`, kept in `contactPay` for admins and members only) so the next bill to them
// fills in by itself.

/** Where a suggested detail comes from. */
export type DetailFrom = 'saved' | 'phone' | 'email' | 'address' | 'website';

export interface DetailChoice {
  value: string;
  from: DetailFrom;
}

/** The two fields a detail goes in: the portal's link, or the payment details note. */
export interface Details {
  payNote: string;
  payUrl: string;
}

/** Values this form filled in itself, by field, so a change of payee or method may replace them. */
export type Prefilled = Partial<Details>;

/** The note's limit in the rules; a longer address is cut to fit. */
const NOTE_MAX = 200;

/** Ways of paying a contact remembers a detail for (not cash or card). */
export const remembers = (m: PayMethod | undefined): m is ContactPayKind => !!m && (CONTACT_PAY_KINDS as readonly string[]).includes(m);

/** Which field a way of paying's detail goes in. */
export const detailField = (m: PayMethod | undefined): keyof Details => (m === 'portal' ? 'payUrl' : 'payNote');

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Details the payee offers for a way of paying, the one saved on them first: Zelle takes the phone
 * or the email, Venmo the phone (or a saved @handle), a check the mailing address, a portal the
 * website when it is an https link. Bank details only ever come from what was saved.
 */
export function detailChoices(contact: Contact | undefined, method: PayMethod | undefined): DetailChoice[] {
  if (!contact || !remembers(method)) return [];
  const out: DetailChoice[] = [];
  const add = (value: string | undefined, from: DetailFrom) => {
    const v = value?.trim().slice(0, method === 'portal' ? 500 : NOTE_MAX);
    if (v && !out.some((c) => same(c.value, v))) out.push({ value: v, from });
  };
  add(contact.pay?.[method], 'saved');
  if (method === 'zelle') {
    add(contact.phone, 'phone');
    add(contact.email, 'email');
  }
  if (method === 'venmo') add(contact.phone, 'phone');
  if (method === 'check') add(contact.address, 'address');
  if (method === 'portal' && contact.website?.startsWith('https://')) add(contact.website, 'website');
  return out;
}

/** What to fill in without asking: the saved detail, else the payee's only fitting one. */
export function prefillFor(contact: Contact | undefined, method: PayMethod | undefined): string | undefined {
  const choices = detailChoices(contact, method);
  if (choices[0]?.from === 'saved') return choices[0].value;
  return choices.length === 1 ? choices[0].value : undefined;
}

/**
 * The details after the payee or the way of paying changed: the new method's field takes the
 * payee's detail when it is empty or still holds what was filled in before; a filled-in value
 * that no longer fits is cleared. Typed text is never replaced.
 */
export function refill(details: Details, prefilled: Prefilled, contact: Contact | undefined, method: PayMethod | undefined): { details: Details; prefilled: Prefilled } {
  const next = { ...details };
  const out: Prefilled = {};
  const target = detailField(method);
  const want = prefillFor(contact, method);
  for (const k of ['payNote', 'payUrl'] as const) {
    const untouched = prefilled[k] !== undefined && details[k] === prefilled[k];
    if (k === target && want && (untouched || !details[k].trim())) {
      next[k] = want;
      out[k] = want;
    } else if (untouched) next[k] = '';
  }
  return { details: next, prefilled: out };
}

/** "@example-rentals" for a Venmo username typed without its @; anything else as typed. */
export function venmoHandle(note: string): string {
  const t = note.trim();
  return /^[A-Za-z0-9_-]{3,30}$/.test(t) && !/^\d+$/.test(t) ? `@${t}` : t;
}

/**
 * The contact's pay details with this bill's, when they have none for its way of paying yet: the
 * first detail saved is remembered, a later different one never replaces it. Null: nothing to write.
 */
export function rememberedPay(contact: Contact | undefined, method: PayMethod | undefined, value: string | undefined): ContactPay | null {
  const v = value?.trim();
  if (!contact || !remembers(method) || !v || contact.pay?.[method]) return null;
  return { ...contact.pay, [method]: v };
}
