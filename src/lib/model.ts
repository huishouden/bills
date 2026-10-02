/**
 * Bills' Firestore shapes under `households/{householdId}`. Field lists match the rules in the
 * project's rules file exactly; builders below drop undefined values (Firestore rejects them).
 */

/** ISO calendar date, `YYYY-MM-DD`. */
export type Ymd = string;

/** A string decimal with two places, as the household's other money data is stored. */
export type { Money } from '@huishouden/pwa-kit/money';
import type { Money } from '@huishouden/pwa-kit/money';

export const BILL_KINDS = ['electric', 'gas', 'water', 'internet', 'phone', 'mortgage', 'hoa', 'insurance', 'other'] as const;
export type BillKind = (typeof BILL_KINDS)[number];

export const KIND_LABELS: Record<BillKind, string> = {
  electric: 'Electric',
  gas: 'Gas',
  water: 'Water',
  internet: 'Internet',
  phone: 'Phone',
  mortgage: 'Mortgage',
  hoa: 'HOA',
  insurance: 'Insurance',
  other: 'Other',
};

export type BillStatus = 'due' | 'paid' | 'credit' | 'unknown';
export type Repeat = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface Autopay {
  enrolled: boolean;
  nextDraft?: Ymd;
  /** How it is paid automatically, when known: charged to a card (a bill found in card spending). */
  via?: 'card';
}

/** `bills/{billId}`: one bill (one statement, or one manual entry). */
export interface BillDoc {
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
export interface BillSourceDoc {
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

export interface SourceInput {
  name: string;
  kind: BillKind;
  from?: string;
  subject?: string;
  label?: string;
  payUrl?: string;
  autopay: boolean | null;
}

export interface ManualBillInput {
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
    createdAt,
    createdBy: by,
    updatedAt: now,
  });
}

/** A source needs at least one way to recognise its emails. */
export function sourceProblem(input: SourceInput): string | null {
  if (!input.name.trim()) return 'Give it a name.';
  if (!input.from?.trim() && !input.subject?.trim() && !input.label?.trim()) return 'Add a sender, subject words or a Gmail label.';
  if (input.payUrl?.trim() && !input.payUrl.trim().startsWith('https://')) return 'The pay link must start with https://';
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
    paidAt: keep?.paidAt,
    paidBy: keep?.paidBy,
    paidVia: keep?.paidVia,
    createdAt,
    createdBy: by,
    updatedAt: now,
  }) as BillDoc;
}

export const withoutId = <T extends { id: string }>({ id: _id, ...rest }: T): Omit<T, 'id'> => rest;
