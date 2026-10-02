import { daysBetween } from './dates';
import { sumMoney } from './money';
import type { Bill, Money, Ymd } from './model';

/**
 * How a bill reads on the main screen.
 * - overdue: past its due date, not paid, no autopay
 * - attention: due within a week and nothing will pay it automatically (unknown autopay counts as off)
 * - autopay / upcoming: due later, or covered by autopay
 * - autopaid: past due with autopay on, so presumed drafted
 * - superseded: an older statement from a source that has sent a newer one
 */
export type BillState = 'overdue' | 'attention' | 'autopay' | 'upcoming' | 'no-date' | 'paid' | 'credit' | 'autopaid' | 'superseded';

export interface BillView {
  bill: Bill;
  state: BillState;
  /** Days until due (negative when past); null without a due date. */
  days: number | null;
}

export const ATTENTION_DAYS = 7;
export const HORIZON_DAYS = 30;

const OPEN: BillState[] = ['overdue', 'attention', 'autopay', 'upcoming', 'no-date'];

/** For each email source, the due date of its newest statement. */
function newestDue(bills: Bill[]): Map<string, Ymd> {
  const out = new Map<string, Ymd>();
  for (const b of bills) {
    if (b.source !== 'email' || !b.sourceId || !b.due || b.dismissed) continue;
    const cur = out.get(b.sourceId);
    if (!cur || b.due > cur) out.set(b.sourceId, b.due);
  }
  return out;
}

export function billState(b: Bill, today: Ymd, newest?: Ymd): BillState {
  if (b.status === 'paid') return 'paid';
  if (b.status === 'credit') return 'credit';
  const days = b.due ? daysBetween(today, b.due) : null;
  if (b.autopay?.enrolled && days !== null && days < 0) return 'autopaid';
  if (b.source === 'email' && newest && b.due && b.due < newest) return 'superseded';
  if (days === null) return 'no-date';
  if (b.autopay?.enrolled) return days < 0 ? 'autopaid' : 'autopay';
  if (days < 0) return 'overdue';
  if (days <= ATTENTION_DAYS) return 'attention';
  return 'upcoming';
}

export function viewBills(bills: Bill[], today: Ymd): BillView[] {
  const newest = newestDue(bills);
  return bills
    .filter((b) => !b.dismissed)
    .map((bill) => ({ bill, state: billState(bill, today, bill.sourceId ? newest.get(bill.sourceId) : undefined), days: bill.due ? daysBetween(today, bill.due) : null }));
}

const byDue = (a: BillView, b: BillView) => (a.bill.due ?? '9999').localeCompare(b.bill.due ?? '9999') || a.bill.label.localeCompare(b.bill.label);

export interface Upcoming {
  overdue: BillView[];
  week: BillView[];
  later: BillView[];
  noDate: BillView[];
  /** Open bills due after the horizon. */
  beyond: number;
}

export function upcoming(views: BillView[], horizon = HORIZON_DAYS): Upcoming {
  const open = views.filter((v) => OPEN.includes(v.state)).sort(byDue);
  return {
    overdue: open.filter((v) => v.days !== null && v.days < 0),
    week: open.filter((v) => v.days !== null && v.days >= 0 && v.days <= ATTENTION_DAYS),
    later: open.filter((v) => v.days !== null && v.days > ATTENTION_DAYS && v.days <= horizon),
    noDate: open.filter((v) => v.days === null),
    beyond: open.filter((v) => v.days !== null && v.days > horizon).length,
  };
}

/** Paid, credited, presumed-drafted and replaced bills, newest first, within the last ~6 months. */
export function history(views: BillView[], today: Ymd): BillView[] {
  return views
    .filter((v) => !OPEN.includes(v.state) && (v.days === null || v.days >= -183))
    .filter((v) => v.bill.due === null || v.bill.due <= today || v.state === 'paid' || v.state === 'credit')
    .sort((a, b) => byDue(b, a));
}

export interface Headline {
  count: number;
  withoutAutopay: number;
  overdue: number;
  total: Money | null;
  text: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "3 bills in the next 30 days; 1 without autopay" for the top of the screen (and a Today card later). */
export function headline(u: Upcoming): Headline {
  const due = [...u.overdue, ...u.week, ...u.later];
  const withoutAutopay = due.filter((v) => v.state === 'overdue' || v.state === 'attention' || (v.state === 'upcoming' && !v.bill.autopay?.enrolled)).length;
  const total = sumMoney(due.map((v) => v.bill.amountDue).filter((m): m is Money => !!m && !m.amount.startsWith('-')));
  const parts = [due.length ? `${plural(due.length, 'bill')} in the next ${HORIZON_DAYS} days` : `No bills in the next ${HORIZON_DAYS} days`];
  if (u.overdue.length) parts.push(`${u.overdue.length} overdue`);
  if (withoutAutopay) parts.push(`${withoutAutopay} without autopay`);
  return { count: due.length, withoutAutopay, overdue: u.overdue.length, total, text: parts.join('; ') };
}
