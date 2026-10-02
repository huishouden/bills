import { addDays, addMonths, type Ymd } from '@huishouden/pwa-kit/time';
import { clean, type Bill, type BillDoc, type Repeat, withoutId } from '../lib/model';

const MONTHS = { monthly: 1, quarterly: 3, yearly: 12 } as const;

/** The due date one repeat later. */
export const stepDue = (due: Ymd, repeat: Repeat): Ymd => (repeat === 'weekly' ? addDays(due, 7) : addMonths(due, MONTHS[repeat]));

/** The bill as paid by a member. */
export function paidDoc(bill: Bill, me: string, now: number): BillDoc {
  return clean({ ...withoutId(bill), status: 'paid' as const, paidAt: now, paidBy: me, paidVia: 'member' as const, updatedAt: now });
}

/** The bill as not paid (Mark unpaid). */
export function unpaidDoc(bill: Bill, now: number): BillDoc {
  const { paidAt: _a, paidBy: _b, paidVia: _c, ...rest } = withoutId(bill);
  return clean({ ...rest, status: 'due' as const, updatedAt: now });
}

/** A repeating manual bill's next one, due one interval later, same amount and autopay. */
export function nextRepeat(bill: Bill, me: string, now: number): BillDoc | null {
  if (bill.source !== 'manual' || !bill.repeat || !bill.due) return null;
  const { paidAt: _a, paidBy: _b, paidVia: _c, ...rest } = withoutId(bill);
  return clean({ ...rest, due: stepDue(bill.due, bill.repeat), status: 'due' as const, createdAt: now, createdBy: me, updatedAt: now });
}

/**
 * Repeating bills on autopay that nobody marks paid: once one's due date has passed, the next one
 * is added (moved past today when several went by). A series is a manual bill's label and repeat;
 * the next one's id comes from the last one's, so two members opening the app at once write the
 * same document.
 */
export function autopayRollovers(bills: Bill[], today: Ymd, me: string, now: number): { id: string; data: BillDoc }[] {
  const series = new Map<string, Bill>();
  for (const b of bills) {
    if (b.source !== 'manual' || !b.repeat || !b.due || b.dismissed) continue;
    const key = `${b.label.toLowerCase()}|${b.repeat}`;
    const cur = series.get(key);
    if (!cur || b.due > cur.due!) series.set(key, b);
  }
  const out: { id: string; data: BillDoc }[] = [];
  for (const last of series.values()) {
    if (!last.autopay?.enrolled || last.status === 'paid' || last.due! >= today) continue;
    let next = nextRepeat(last, me, now)!;
    while (next.due! < today) next = { ...next, due: stepDue(next.due!, last.repeat!) };
    out.push({ id: `${last.id.split('~')[0]}~${next.due}`, data: next });
  }
  return out;
}
