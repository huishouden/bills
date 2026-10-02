import { findRecurring, sameMerchant, type CardCharge, type RecurringCandidate } from '@huishouden/pwa-kit/recurring';
import { addDays, type Ymd } from '@huishouden/pwa-kit/time';
import type { Bill, BillKind, BillSource, BillSuggestion, ManualBillInput } from './model';

/**
 * "Possible regular bills": regular charges in the household's card spending (Huishouden
 * Spending's `spendingTransactions`) that aren't bills here yet. Finding them is the kit's
 * (`@huishouden/pwa-kit/recurring`); which ones to offer, and as what bill, is Bills' policy.
 */

/** How far back card spending is read: a little over a year, so a yearly charge shows twice. */
export const SPENDING_DAYS = 400;
/** Suggestions shown at once. */
export const MAX_SUGGESTIONS = 5;

export const spendingSince = (today: Ymd): Ymd => addDays(today, -SPENDING_DAYS);

/** A Spending transaction document as the recurring finder reads it; null when it isn't one. */
export function toCharge(d: Record<string, unknown>): CardCharge | null {
  const amount = typeof d.amount === 'number' ? d.amount : Number(d.amount);
  if (typeof d.date !== 'string' || typeof d.description !== 'string' || !Number.isFinite(amount)) return null;
  return {
    date: d.date,
    description: d.description,
    amount,
    ...(typeof d.category === 'string' ? { category: d.category } : {}),
    ...(typeof d.type === 'string' ? { type: d.type } : {}),
  };
}

/** A Firestore id for a merchant key: "apple#10" → "apple_10", "planet fitness" → "planet-fitness". */
export const suggestionId = (merchantKey: string) => merchantKey.replace(/#/g, '_').replace(/[^a-z0-9_]+/g, '-').slice(0, 120) || 'merchant';

const KIND_WORDS: [BillKind, RegExp][] = [
  ['insurance', /insurance|geico|state farm|progressive|allstate|liberty mutual|lemonade/i],
  ['phone', /wireless|mobile|verizon|at&t|\batt\b|t-mobile|google fi|phone/i],
  ['internet', /internet|broadband|fiber|xfinity|comcast|spectrum|\bcox\b/i],
  ['electric', /electric|power|energy/i],
  ['water', /\bwater\b|sewer/i],
  ['gas', /natural gas|gas company|gas utility/i],
  ['hoa', /\bhoa\b|homeowners assoc/i],
];

/** The bill kind a candidate most likely is; subscriptions and anything unrecognised are "other". */
export function kindFor(c: RecurringCandidate): BillKind {
  if (c.subscription) return 'other';
  const text = `${c.displayName} ${c.merchantKey}`;
  return KIND_WORDS.find(([, re]) => re.test(text))?.[0] ?? 'other';
}

const amountClose = (a: number, b: number) => Math.abs(a - b) <= Math.max(a, b) * 0.25;

/**
 * Whether the household already keeps this one: a bill with the same merchant name and a similar
 * amount (or no amount, or a candidate whose amount varies), or a bill source for the same
 * merchant (its name, or its sender's domain).
 */
export function alreadyKept(c: RecurringCandidate, bills: Bill[], sources: BillSource[]): boolean {
  const named = (name: string) => sameMerchant(name, c.displayName) || sameMerchant(name, c.merchantKey.split('#')[0]);
  const byBill = bills.some((b) => {
    if (!named(b.label)) return false;
    const amount = b.amountDue ? Number(b.amountDue.amount) : null;
    return amount === null || c.amountVaries || amountClose(amount, c.typicalAmount);
  });
  if (byBill) return true;
  return sources.some((s) => {
    if (named(s.name)) return true;
    const domain = s.from?.split('@').pop()?.split('.').slice(-2, -1)[0];
    return !!domain && domain.length >= 3 && c.merchantKey.split(/[ #]/)[0] === domain;
  });
}

/** The name a candidate's bill gets: the merchant, with its amount when the merchant has two regular charges. */
export function suggestionLabel(c: RecurringCandidate, all: RecurringCandidate[]): string {
  const twin = all.some((o) => o !== c && o.displayName === c.displayName);
  return (twin ? `${c.displayName} $${c.typicalAmount.toFixed(2)}` : c.displayName).slice(0, 60);
}

/** The repeating bill "Add" creates: charged to a card automatically, next due when the next charge is expected. */
export function suggestionBill(c: RecurringCandidate, all: RecurringCandidate[]): ManualBillInput {
  return {
    label: suggestionLabel(c, all),
    kind: kindFor(c),
    due: c.nextExpected,
    amount: c.typicalAmount.toFixed(2),
    autopay: true,
    autopayVia: 'card',
    repeat: c.cadence,
  };
}

export interface Suggestions {
  /** Every regular charge found, most confident first. */
  all: RecurringCandidate[];
  /** Not answered and not already a bill or source: what the card offers (up to `MAX_SUGGESTIONS`). */
  fresh: RecurringCandidate[];
  /** Subscriptions among the charges found, except the ones a member said aren't bills. */
  subscriptions: { count: number; monthly: number };
}

export function suggestions(charges: CardCharge[], today: Ymd, bills: Bill[], sources: BillSource[], answers: BillSuggestion[]): Suggestions {
  const all = findRecurring(charges, { now: today });
  const answered = new Map(answers.map((a) => [a.id, a.status]));
  const fresh = all.filter((c) => !answered.has(suggestionId(c.merchantKey)) && !alreadyKept(c, bills, sources));
  const subs = all.filter((c) => c.subscription && answered.get(suggestionId(c.merchantKey)) !== 'dismissed');
  const monthly = Math.round(subs.reduce((sum, c) => sum + c.monthlyAmount * 100, 0)) / 100;
  return { all, fresh: fresh.slice(0, MAX_SUGGESTIONS), subscriptions: { count: subs.length, monthly } };
}
