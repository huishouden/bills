/**
 * Bills' Firestore shapes under `households/{householdId}`. Field lists match the rules in the
 * project's rules file exactly; builders below drop undefined values (Firestore rejects them).
 */

/** ISO calendar date, `YYYY-MM-DD`. */
export type Ymd = string;

/** A string decimal with two places, as the household's other money data is stored. */
export type { Money } from '@huishouden/pwa-kit/money';
import type { Money } from '@huishouden/pwa-kit/money';
import { t } from '../i18n';

export const BILL_KINDS = ['rent', 'electric', 'gas', 'water', 'internet', 'phone', 'mortgage', 'hoa', 'insurance', 'other'] as const;
export type BillKind = (typeof BILL_KINDS)[number];

const KIND_KEYS = {
  rent: 'kinds.rent',
  electric: 'kinds.electric',
  gas: 'kinds.gas',
  water: 'kinds.water',
  internet: 'kinds.internet',
  phone: 'kinds.phone',
  mortgage: 'kinds.mortgage',
  hoa: 'kinds.hoa',
  insurance: 'kinds.insurance',
  other: 'kinds.other',
} as const satisfies Record<BillKind, string>;

/** What a kind is called in the active language: "Electric", "Luz", "Stroom". */
export const kindLabel = (kind: BillKind): string => t(KIND_KEYS[kind] ?? 'kinds.other');

export type BillStatus = 'due' | 'paid' | 'credit' | 'unknown';

/** How a bill is paid when nobody's autopay does it. `portal` is the provider's site (`payUrl`). */
export const PAY_METHODS = ['zelle', 'venmo', 'bank', 'check', 'cash', 'card', 'portal'] as const;
export type PayMethod = (typeof PAY_METHODS)[number];

/**
 * A bill's own reminders: off, or on with the days before its due date (0 the day itself) and
 * whether to say so the day after when it is still unpaid. Days and overdue left out follow the
 * household's (billSettings/main). No `remind` at all: the household's default decides.
 */
export interface BillReminder {
  on: boolean;
  days?: number[];
  overdue?: boolean;
}

/** Days before the due date a reminder may be set for: up to 4 of 0-30. */
export const REMIND_MAX_DAYS = 30;
export const REMIND_MAX_COUNT = 4;

/** Who and how: fields a bill and a bill source share (a source's apply to its email bills). */
export interface PayFields {
  /** The household contact it is paid to (the landlord). */
  payeeContactId?: string;
  payMethod?: PayMethod;
  /** What paying needs: the Zelle email or phone, a memo line. */
  payNote?: string;
  /** The member who pays it (lowercase email); only they are reminded. */
  payer?: string;
  remind?: BillReminder;
}

/** Which bills remind without a setting of their own: none, those paid by hand (autopay off), or every one not on autopay. */
export type RemindDefault = 'none' | 'manual' | 'all';

/** `billSettings/main`: the household's bill reminders. */
export interface BillSettings {
  remindDefault: RemindDefault;
  /** Days before the due date, 0 the day itself. */
  remindDays: number[];
  /** A reminder the day after the due date while unpaid. */
  remindOverdue: boolean;
  /** Where 9:00 is: the household's time zone (IANA), set from the device that saved it. */
  timeZone?: string;
  updatedAt?: number;
  updatedBy?: string;
}

/** Until someone changes them: no bill reminds by itself; one turned on reminds 3 days before, on the day, and the day after. */
export const DEFAULT_BILL_SETTINGS: BillSettings = { remindDefault: 'none', remindDays: [3, 0], remindOverdue: true };

/** Up to 4 whole days of 0-30, without repeats, latest first. */
export function cleanDays(days: readonly number[] | undefined): number[] {
  return [...new Set((days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= REMIND_MAX_DAYS))].sort((a, b) => b - a).slice(0, REMIND_MAX_COUNT);
}

export function cleanReminder(r: BillReminder | null | undefined): BillReminder | undefined {
  if (!r) return undefined;
  return clean({ on: r.on === true, days: r.days ? cleanDays(r.days) : undefined, overdue: typeof r.overdue === 'boolean' ? r.overdue : undefined });
}

/** The pay fields as stored: trimmed, empty ones left out. */
export function payFields(input: PayFields): PayFields {
  return clean({
    payeeContactId: trimmed(input.payeeContactId, 100),
    payMethod: input.payMethod && (PAY_METHODS as readonly string[]).includes(input.payMethod) ? input.payMethod : undefined,
    payNote: trimmed(input.payNote, 200),
    payer: trimmed(input.payer?.toLowerCase(), 200),
    remind: cleanReminder(input.remind),
  });
}
export type Repeat = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface Autopay {
  enrolled: boolean;
  nextDraft?: Ymd;
  /** How it is paid automatically, when known: charged to a card (a bill found in card spending). */
  via?: 'card';
}

/** `bills/{billId}`: one bill (one statement, or one manual entry). */
export interface BillDoc extends PayFields {
  schema: 'bill/v1';
  source: 'email' | 'manual';
  /** The bill source it was read from (email bills only). */
  sourceId?: string;
  kind: BillKind;
  label: string;
  due: Ymd | null;
  amountDue: Money | null;
  status: BillStatus;
  autopay: Autopay | null;
  period?: { start: Ymd; end: Ymd };
  payUrl?: string;
  repeat?: Repeat;
  /** Gmail message id of the statement, so the member who synced can open it. */
  emailId?: string;
  paidAt?: number;
  paidBy?: string;
  paidVia?: 'member' | 'email';
  /** An email bill a member removed; kept so the next email check doesn't bring it back. */
  dismissed?: boolean;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  /** When an email sync last saw this statement. */
  observedAt?: number;
}

export interface Bill extends BillDoc {
  id: string;
}

/** `billSources/{sourceId}`: which emails are one provider's bills. Household data, never code. */
export interface BillSourceDoc extends PayFields {
  name: string;
  kind: BillKind;
  /** A sender address or a whole domain. */
  from?: string;
  /** Words the subject contains. */
  subject?: string;
  /** A Gmail label the household files these under. */
  label?: string;
  payUrl?: string;
  /** What the household knows when the emails don't say; null = let the emails decide. */
  autopay: boolean | null;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
}

export interface BillSource extends BillSourceDoc {
  id: string;
}

/** `billSync/{memberEmail}`: the last email check from one member's Gmail. */
export interface BillSyncDoc {
  checkedAt: number;
  by: string;
  sources: number;
  emails: number;
  bills: number;
  errors: string[];
}

export interface BillSync extends BillSyncDoc {
  id: string;
}

export interface SourceInput extends PayFields {
  name: string;
  kind: BillKind;
  from?: string;
  subject?: string;
  label?: string;
  payUrl?: string;
  autopay: boolean | null;
}

export interface ManualBillInput extends PayFields {
  label: string;
  kind: BillKind;
  due: Ymd | null;
  amount: string | null;
  autopay: boolean | null;
  /** Autopay by card; kept through edits while autopay stays on. */
  autopayVia?: 'card';
  repeat: Repeat | null;
  payUrl?: string;
}

/** `billSuggestions/{id}`: a member's answer to a regular charge found in card spending, keyed by its merchant. */
export interface BillSuggestionDoc {
  status: 'added' | 'dismissed';
  name: string;
  /** The bill it became (added). */
  billId?: string;
  by: string;
  at: number;
}

export interface BillSuggestion extends BillSuggestionDoc {
  id: string;
}

export function clean<T extends object>(o: T): T {
  const out = {} as T;
  for (const [k, v] of Object.entries(o)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

const trimmed = (s: string | undefined, max: number) => {
  const t = s?.trim().slice(0, max);
  return t ? t : undefined;
};

export function sourceDoc(input: SourceInput, by: string, createdAt: number, now: number): BillSourceDoc {
  return clean({
    name: input.name.trim().slice(0, 60),
    kind: input.kind,
    from: trimmed(input.from?.toLowerCase(), 200),
    subject: trimmed(input.subject, 200),
    label: trimmed(input.label, 200),
    payUrl: input.payUrl?.trim().startsWith('https://') ? input.payUrl.trim().slice(0, 500) : undefined,
    autopay: input.autopay,
    ...payFields(input),
    createdAt,
    createdBy: by,
    updatedAt: now,
  });
}

/** A source needs at least one way to recognise its emails. */
export function sourceProblem(input: SourceInput): string | null {
  if (!input.name.trim()) return t('form.noName');
  if (!input.from?.trim() && !input.subject?.trim() && !input.label?.trim()) return t('source.needsMatch');
  if (input.payUrl?.trim() && !input.payUrl.trim().startsWith('https://')) return t('form.badLink');
  return null;
}

export function manualBillDoc(input: ManualBillInput, by: string, createdAt: number, now: number, keep?: Partial<BillDoc>): BillDoc {
  const amount = input.amount?.trim() ? input.amount.trim() : null;
  return clean({
    schema: 'bill/v1',
    source: 'manual',
    kind: input.kind,
    label: input.label.trim().slice(0, 60),
    due: input.due,
    amountDue: amount ? { amount, currency: 'USD' } : null,
    status: keep?.status ?? (amount === '0.00' ? 'paid' : 'due'),
    autopay: input.autopay === null ? null : input.autopay && (input.autopayVia ?? keep?.autopay?.via) ? { enrolled: true, via: 'card' as const } : { enrolled: input.autopay },
    payUrl: input.payUrl?.trim().startsWith('https://') ? input.payUrl.trim().slice(0, 500) : undefined,
    repeat: input.repeat ?? undefined,
    ...payFields(input),
    paidAt: keep?.paidAt,
    paidBy: keep?.paidBy,
    paidVia: keep?.paidVia,
    createdAt,
    createdBy: by,
    updatedAt: now,
  }) as BillDoc;
}
