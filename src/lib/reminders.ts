import type { Contact } from '@huishouden/pwa-kit/contact-core';
import { getHome, householdTimeZone, type HouseholdHome } from '@huishouden/pwa-kit/home';
import { zonedTime } from '@huishouden/pwa-kit/ics';
import { formatMoney } from '@huishouden/pwa-kit/money';
import { reminderId, type ReminderInput, type ReminderSource } from '@huishouden/pwa-kit/reminders';
import { appUrl, SUITE_ORIGIN } from '@huishouden/pwa-kit/site';
import { addDays, toYmd, type Ymd } from '@huishouden/pwa-kit/time';
import { t } from '../i18n';
import { AGENDA_APP } from './agenda';
import { cleanDays, DEFAULT_BILL_SETTINGS, type Bill, type BillReminder, type BillSettings, type BillSource } from './model';
import { payInfo, payLine } from './pay';
import { viewBills } from './view';

/** When bill reminders go out, on the household's clock. */
export const REMIND_TIME = '09:00';

export const reminderRef = (billId: string) => `${AGENDA_APP}:bill:${billId}`;

/** A link that opens Bills on one bill. In the browser the origin is the page's, so staging links to staging. */
export const billUrl = (billId: string) =>
  appUrl(import.meta.env?.BASE_URL ?? '/bills/', `?bill=${encodeURIComponent(billId)}`, globalThis.location?.origin ?? SUITE_ORIGIN);

/** The device's time zone, for a household that hasn't saved one. */
export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/**
 * The zone reminders keep: the household's home zone when its home has one (so 9:00 is 9:00 at
 * home wherever the phone is), else the one saved with the settings, else this device's.
 */
export const reminderZone = (settings: Pick<BillSettings, 'timeZone'> | null, home: Pick<HouseholdHome, 'timeZone'> | undefined = getHome()) =>
  householdTimeZone(home, settings?.timeZone || deviceTimeZone());

export interface Plan {
  /** Days before the date, 0 the day itself, latest first. */
  days: number[];
  overdue: boolean;
}

/**
 * When a bill reminds, or null when it doesn't: its own setting (or its source's) when it has one,
 * else the household's default, which never covers bills on autopay. "Paid by hand" means autopay
 * is known to be off; "all" adds those whose autopay is unknown.
 */
export function remindPlan(bill: Bill, own: BillReminder | undefined, settings: BillSettings): Plan | null {
  const autopay = bill.autopay?.enrolled === true;
  if (own) {
    if (!own.on) return null;
    return { days: cleanDays(own.days ?? settings.remindDays), overdue: !autopay && (own.overdue ?? settings.remindOverdue) };
  }
  if (autopay) return null;
  const covered = settings.remindDefault === 'all' || (settings.remindDefault === 'manual' && bill.autopay?.enrolled === false);
  return covered ? { days: cleanDays(settings.remindDays), overdue: settings.remindOverdue } : null;
}

/**
 * What a bill's reminders are about, for the shared sender to check before sending: the bill, while
 * it is unpaid, not skipped and still due that day. Paid or skipped anywhere (the portal's To-do
 * list, the connector, a calendar), re-dated or removed, its reminders are deleted unsent.
 */
export const billSource = (bill: Pick<Bill, 'id' | 'due'>): ReminderSource => ({
  checks: [{ doc: `bills/${bill.id}`, due: [{ field: 'status', notIn: ['paid', 'credit'] }, { field: 'dismissed', notIn: [true] }, { field: 'due', in: [bill.due] }] }],
});

export interface ReminderContext {
  sources: readonly BillSource[];
  contacts: readonly Contact[];
  settings: BillSettings | null;
  now: number;
}

function title(label: string, kind: 'before' | 'today' | 'overdue', days: number, autopay: boolean): string {
  if (kind === 'overdue') return t('remind.overdue', { name: label });
  if (autopay) return kind === 'today' ? t('remind.draftsToday', { name: label }) : t('remind.draftsIn', { name: label, days });
  return kind === 'today' ? t('remind.dueToday', { name: label }) : t('remind.dueIn', { name: label, days });
}

/**
 * Every reminder Bills wants the shared sender to deliver, in the page's language (wrap in
 * `localizeReminders` for every language): for each open, unskipped bill with a date that
 * reminds (`remindPlan`), one at 9:00 on the household's clock on each chosen day before it is due
 * (an autopay bill's draft date when it has one) and, unless autopay pays it, one the day after.
 * Past ones are left out. Each goes to the member who pays it when one is named, else to everyone
 * (private: the sender skips helpers and kids). Paid, skipped and removed bills have none, so
 * writing the list again cancels theirs. Each carries its bill as `source` (`billSource`), so the
 * sender drops it once the bill is paid elsewhere, before Bills is next opened.
 */
export function billReminders(bills: Bill[], { sources, contacts, settings, now }: ReminderContext): ReminderInput[] {
  const s = settings ?? DEFAULT_BILL_SETTINGS;
  const zone = reminderZone(s);
  const at = (day: Ymd) => zonedTime(day, REMIND_TIME, zone);
  const out: ReminderInput[] = [];
  for (const { bill, state } of viewBills(bills, toYmd(now))) {
    if (!bill.due || bill.dismissed) continue;
    if (state !== 'overdue' && state !== 'attention' && state !== 'upcoming' && state !== 'autopay') continue;
    const info = payInfo(bill, sources, contacts);
    const plan = remindPlan(bill, info.remind, s);
    if (!plan) continue;
    const autopay = bill.autopay?.enrolled === true;
    const date = autopay ? (bill.autopay?.nextDraft ?? bill.due) : bill.due;
    const body = [bill.amountDue ? formatMoney(bill.amountDue) : null, payLine(info), info.payNote].filter(Boolean).join(' · ');
    const ref = reminderRef(bill.id);
    const base = { app: AGENDA_APP, body, url: billUrl(bill.id), recipients: info.payer ? [info.payer] : ('all' as const), ref, private: true, source: billSource(bill) };
    const times: [number, string][] = plan.days.map((d) => [at(addDays(date, -d)), title(bill.label, d === 0 ? 'today' : 'before', d, autopay)]);
    if (plan.overdue) times.push([at(addDays(bill.due, 1)), title(bill.label, 'overdue', 0, autopay)]);
    for (const [when, words] of times) {
      if (when <= now) continue;
      out.push({ ...base, id: reminderId(ref, when), title: words, at: when });
    }
  }
  return out.sort((a, b) => a.at - b.at || a.id!.localeCompare(b.id!));
}

/** Whether any bill reminds anyone: when to suggest turning notifications on. */
export const anyReminders = (bills: Bill[], ctx: ReminderContext) => billReminders(bills, ctx).length > 0;
