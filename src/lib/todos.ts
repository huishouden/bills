import { allDayStart } from '@huishouden/pwa-kit/agenda';
import { formatMoney } from '@huishouden/pwa-kit/money';
import type { Role } from '@huishouden/pwa-kit/roles';
import type { Op } from '@huishouden/pwa-kit/store';
import { toYmd } from '@huishouden/pwa-kit/time';
import type { TodoInput } from '@huishouden/pwa-kit/todos';
import { nextId, nextRepeat } from '../data/build';
import { APP_URL, billRef } from './agenda';
import type { Bill } from './model';
import { t } from '../i18n';
import { HORIZON_DAYS, viewBills, type BillState } from './view';

/** Bills is money: only admins and members change bills (the rules' `staff()`). */
const STAFF: Role[] = ['admin', 'member'];

/** What the Upcoming screen asks someone to pay: open bills, but not those autopay will draft. */
const TO_PAY: BillState[] = ['overdue', 'attention', 'upcoming', 'no-date'];

/**
 * A repeating manual bill's next one, as the create op written when it is paid or skipped from the
 * portal: the same document the app writes (`nextId`), dated by whoever taps and when.
 */
function nextOp(bill: Bill): Op[] {
  const next = nextRepeat(bill, '$me', 0);
  return next ? [{ col: 'bills', id: nextId(bill, next.due!), data: { ...next, createdAt: '$now', createdBy: '$me', updatedAt: '$now' } }] : [];
}

/**
 * Bills to pay, for the household's to-do list (`syncTodos`): each unpaid, not skipped bill the
 * Upcoming screen lists without autopay, within its 30 days (or with no due date), in the page's
 * language (wrap in `localizeTodos` for every language). "Mark paid"
 * writes what the app's Paid button does; "Skip" marks it skipped (kept in History). Both add a
 * repeating bill's next one, as the app does. Always private: Bills is money.
 */
export function todoItems(bills: Bill[], now: number, url = APP_URL, horizon = HORIZON_DAYS): TodoInput[] {
  return viewBills(bills, toYmd(now))
    .filter((v) => TO_PAY.includes(v.state) && !v.bill.autopay?.enrolled && (v.days === null || v.days <= horizon))
    .map(({ bill }): TodoInput => {
      const next = nextOp(bill);
      return {
        ref: billRef(bill.id),
        title: bill.label,
        ...(bill.amountDue ? { detail: formatMoney(bill.amountDue) } : {}),
        createdAt: bill.createdAt,
        ...(bill.due ? { due: allDayStart(bill.due) } : {}),
        url,
        owner: bill.createdBy.toLowerCase(),
        private: true,
        done: {
          label: t('todo.markPaid'),
          ops: [{ col: 'bills', id: bill.id, data: { status: 'paid', paidAt: '$now', paidBy: '$me', paidVia: 'member', updatedAt: '$now' }, merge: true }, ...next],
          roles: STAFF,
        },
        cancel: {
          label: t('todo.skip'),
          ops: [{ col: 'bills', id: bill.id, data: { dismissed: true, updatedAt: '$now' }, merge: true }, ...next],
          roles: STAFF,
        },
      };
    });
}
