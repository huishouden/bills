import { addMonths } from '@huishouden/pwa-kit/time';
import { clean, type Bill, type BillDoc, withoutId } from '../lib/model';

const STEP = { monthly: 1, quarterly: 3, yearly: 12 } as const;

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
  return clean({ ...rest, due: addMonths(bill.due, STEP[bill.repeat]), status: 'due' as const, createdAt: now, createdBy: me, updatedAt: now });
}
