import { allDayStart, type AgendaInput } from '@huishouden/pwa-kit/agenda';
import { formatMoney } from '@huishouden/pwa-kit/money';
import { appUrl, SUITE_ORIGIN } from '@huishouden/pwa-kit/site';
import { capitalize } from '@huishouden/pwa-kit/i18n';
import { toYmd } from '@huishouden/pwa-kit/time';
import { t } from '../i18n';
import type { Autopay, Bill } from './model';
import { viewBills, type BillView } from './view';

/** This app's name on the household agenda. */
export const AGENDA_APP = 'bills';
/**
 * The app's address on the suite's one site; there are no per-bill routes, so items open its
 * Upcoming screen. In the browser the origin is the page's, so staging links to staging.
 */
export const APP_URL = appUrl(import.meta.env.BASE_URL ?? '/bills/', '', globalThis.location?.origin ?? SUITE_ORIGIN);

export const billRef = (id: string) => `bill:${id}`;

type Item = Omit<AgendaInput, 'ref'>;

const autopayText = (a: Autopay | null) =>
  t(a === null ? 'agenda.autopayUnknown' : a.enrolled ? (a.via === 'card' ? 'agenda.autopayCard' : 'agenda.autopayOn') : 'agenda.autopayOff');

/**
 * A bill still to pay, on its due date: what the Upcoming screen lists with a date. Paid,
 * credited, presumed-drafted, replaced and removed bills are history and stay in the app.
 * Bills on autopay carry no status: nobody has to do anything, and a status would let the portal
 * call them overdue once the day passes.
 */
function itemFor({ bill, state }: BillView, url: string): Item | null {
  if (!bill.due) return null;
  if (state !== 'overdue' && state !== 'attention' && state !== 'upcoming' && state !== 'autopay') return null;
  const detail = [bill.amountDue ? formatMoney(bill.amountDue) : null, autopayText(bill.autopay)].filter(Boolean).join(', ');
  return {
    kind: 'bill',
    title: bill.label,
    start: allDayStart(bill.due),
    allDay: true,
    detail: capitalize(detail),
    url,
    ...(state === 'autopay' ? {} : { status: state === 'overdue' ? ('overdue' as const) : ('upcoming' as const) }),
  };
}

/** A bill as it goes on the household agenda, for "Add to calendar" on its row; null when it isn't due. */
export function billCalendarEntry(view: BillView, url = APP_URL): Item | null {
  return itemFor(view, url);
}

/** Everything Bills publishes, for `syncAgenda` (the kit keeps only the publishing window). */
export function agendaItems(bills: Bill[], now: number, url = APP_URL): AgendaInput[] {
  return viewBills(bills, toYmd(now)).flatMap((v) => {
    const item = itemFor(v, url);
    return item ? [{ ...item, ref: billRef(v.bill.id) }] : [];
  });
}

/**
 * One bill's items, for `replaceAgenda` when it is saved: `bill` as written, read against the
 * household's other bills (a newer statement replaces an older one). Empty when it isn't due.
 */
export function billAgenda(bill: Bill, bills: Bill[], now: number, url = APP_URL): Item[] {
  const all = [...bills.filter((b) => b.id !== bill.id), bill];
  const view = viewBills(all, toYmd(now)).find((v) => v.bill.id === bill.id);
  const item = view ? itemFor(view, url) : null;
  return item ? [item] : [];
}
