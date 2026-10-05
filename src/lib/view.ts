import { sumMoney } from '@huishouden/pwa-kit/money';
import { daysBetween } from '@huishouden/pwa-kit/time';
import { canUndoDone } from '@huishouden/pwa-kit/react/ui';
import type { Bill, Money, Ymd } from './model';
import { t } from '../i18n';

/**
 * How a bill reads on the main screen.
 * - overdue: past its due date, not paid, no autopay
 * - attention: due within a week and nothing will pay it automatically (unknown autopay counts as off)
 * - autopay / upcoming: due later, or covered by autopay
 * - autopaid: past due with autopay on, so presumed drafted
 * - superseded: an older statement from a source that has sent a newer one
 * - skipped: an open bill a member skipped ("Skip" here or on the portal's To-do list): not paid
 *   through Bills, kept in history
 */
export type BillState = 'overdue' | 'attention' | 'autopay' | 'upcoming' | 'no-date' | 'paid' | 'credit' | 'autopaid' | 'superseded' | 'skipped';

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

/**
 * Every bill as the screens read it. `dismissed` on a bill that would otherwise be open means it
 * was skipped; on any other (a removed paid, drafted or replaced email bill) it is hidden.
 */
export function viewBills(bills: Bill[], today: Ymd): BillView[] {
  const newest = newestDue(bills);
  return bills.flatMap((bill) => {
    const state = billState(bill, today, bill.sourceId ? newest.get(bill.sourceId) : undefined);
    if (bill.dismissed && !OPEN.includes(state)) return [];
    return [{ bill, state: bill.dismissed ? ('skipped' as const) : state, days: bill.due ? daysBetween(today, bill.due) : null }];
  });
}

/** Whether a bill still asks for something: the Upcoming screen's bills. */
export const isOpen = (state: BillState) => OPEN.includes(state);

const byDue = (a: BillView, b: BillView) => (a.bill.due ?? '9999').localeCompare(b.bill.due ?? '9999') || a.bill.label.localeCompare(b.bill.label);

export interface Upcoming {
  overdue: BillView[];
  week: BillView[];
  later: BillView[];
  noDate: BillView[];
  /** Open bills due after the horizon. */
  beyond: number;
  /**
   * Bills a member marked paid in the last few hours (`canUndoDone`), by the group they were in:
   * shown after the open ones, done, with Undo (DESIGN.md "Completion").
   */
  paid: { overdue: BillView[]; week: BillView[]; later: BillView[]; noDate: BillView[] };
}

/** Whether a bill was marked paid here recently enough to show as done on Upcoming. */
export const recentlyPaid = (v: BillView, now: number) => v.state === 'paid' && v.bill.paidVia === 'member' && canUndoDone(v.bill.paidAt, now);

/** The next `horizon` days in groups; with `now`, the bills paid here in the last few hours too (`paid`). */
export function upcoming(views: BillView[], horizon = HORIZON_DAYS, now?: number): Upcoming {
  const groups = (list: BillView[]) => ({
    overdue: list.filter((v) => v.days !== null && v.days < 0),
    week: list.filter((v) => v.days !== null && v.days >= 0 && v.days <= ATTENTION_DAYS),
    later: list.filter((v) => v.days !== null && v.days > ATTENTION_DAYS && v.days <= horizon),
    noDate: list.filter((v) => v.days === null),
  });
  const open = views.filter((v) => OPEN.includes(v.state)).sort(byDue);
  const paid = now === undefined ? [] : views.filter((v) => recentlyPaid(v, now)).sort(byDue);
  return {
    ...groups(open),
    beyond: open.filter((v) => v.days !== null && v.days > horizon).length,
    paid: groups(paid),
  };
}

/** Paid, credited, presumed-drafted, replaced and skipped bills, newest first, within the last ~6 months. */
export function history(views: BillView[], today: Ymd): BillView[] {
  return views
    .filter((v) => !OPEN.includes(v.state) && (v.days === null || v.days >= -183))
    .filter((v) => v.bill.due === null || v.bill.due <= today || v.state === 'paid' || v.state === 'credit' || v.state === 'skipped')
    .sort((a, b) => byDue(b, a));
}

export interface Headline {
  count: number;
  withoutAutopay: number;
  overdue: number;
  total: Money | null;
  text: string;
}

/** "3 bills in the next 30 days; 1 without autopay" for the top of the screen (and a Today card later). */
export function headline(u: Upcoming): Headline {
  const due = [...u.overdue, ...u.week, ...u.later];
  const withoutAutopay = due.filter((v) => v.state === 'overdue' || v.state === 'attention' || (v.state === 'upcoming' && !v.bill.autopay?.enrolled)).length;
  const total = sumMoney(due.map((v) => v.bill.amountDue).filter((m): m is Money => !!m && !m.amount.startsWith('-')));
  const parts = [due.length ? t('headline.bills', { count: due.length, days: HORIZON_DAYS }) : t('headline.none', { days: HORIZON_DAYS })];
  if (u.overdue.length) parts.push(t('headline.overdue', { count: u.overdue.length }));
  if (withoutAutopay) parts.push(t('headline.withoutAutopay', { count: withoutAutopay }));
  return { count: due.length, withoutAutopay, overdue: u.overdue.length, total, text: parts.join('; ') };
}
