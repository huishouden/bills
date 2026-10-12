import type { Firestore } from 'firebase/firestore';
import { localizeAgenda, removeAgenda, replaceAgenda, syncAgenda } from '@huishouden/pwa-kit/agenda';
import { localizeTodos, syncTodos } from '@huishouden/pwa-kit/todos';
import { localizeReminders, syncReminders } from '@huishouden/pwa-kit/reminders';
import { AGENDA_APP, agendaItems, APP_URL, billAgenda, billRef } from '../lib/agenda';
import { todoItems } from '../lib/todos';
import { billReminders, type ReminderContext } from '../lib/reminders';
import type { Bill } from '../lib/model';
import type { PayContext } from '../lib/pay';

type PublishedStorage = NonNullable<Parameters<typeof syncAgenda>[4]['published']>;

export interface PublishOptions {
  now: number;
  /** The app's address for the deep links (default this site's). */
  url?: string;
  pay?: PayContext;
  /** Where this device notes what it last published (default localStorage; null reads every time). */
  published?: PublishedStorage | null;
}

const opts = ({ published }: PublishOptions) => (published === undefined ? {} : { published });

/** The bills on the household agenda: one query of what Bills published (none when this device already published the same). */
export async function publishAgenda(db: Firestore, householdId: string, me: string, bills: Bill[], o: PublishOptions) {
  const items = await localizeAgenda(() => agendaItems(bills, o.now, o.url ?? APP_URL, o.pay));
  return syncAgenda(db, householdId, AGENDA_APP, items, { by: me, now: o.now, ...opts(o) });
}

/**
 * One bill's agenda items after a write touched it: as written (none once paid or removed), or
 * their removal when the bill is gone. Writes only, by the bill's ref: nothing is read.
 */
export async function followAgenda(db: Firestore, householdId: string, me: string, billId: string, bills: Bill[], o: Omit<PublishOptions, 'published'>) {
  const bill = bills.find((b) => b.id === billId);
  if (!bill) return removeAgenda(db, householdId, AGENDA_APP, billRef(billId));
  const items = await localizeAgenda(() => billAgenda(bill, bills, o.now, o.url ?? APP_URL, o.pay));
  return replaceAgenda(db, householdId, AGENDA_APP, billRef(billId), items, { by: me });
}

/** The bills to pay on the household's to-do list: one query, as `publishAgenda`. */
export async function publishTodos(db: Firestore, householdId: string, me: string, bills: Bill[], o: PublishOptions) {
  const items = await localizeTodos(() => todoItems(bills, o.now, o.url ?? APP_URL, undefined, o.pay));
  return syncTodos(db, householdId, AGENDA_APP, items, { by: me, now: o.now, ...opts(o) });
}

/** The bills' push reminders: one query, as `publishAgenda`. */
export async function publishReminders(db: Firestore, householdId: string, me: string, bills: Bill[], ctx: Omit<ReminderContext, 'now'>, o: Omit<PublishOptions, 'url' | 'pay'>) {
  const items = await localizeReminders(() => billReminders(bills, { ...ctx, now: o.now }));
  return syncReminders(db, householdId, AGENDA_APP, items, me, o.now, opts(o));
}
