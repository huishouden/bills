import { changes, withoutId, type Backend as KitBackend, type Op as KitOp } from '@huishouden/pwa-kit/store';
import { track } from '@huishouden/pwa-kit/observability';
import { payeeContacts, type BillsData } from '../lib/demo';
import { CONTACT_PAY_COLLECTION, cleanContact, contactPayDoc } from '@huishouden/pwa-kit/contact-core';
import { cleanDays, manualBillDoc, sourceDoc, type BillSettings, type BillSuggestionDoc, type PayFields } from '../lib/model';
import { reminderZone } from '../lib/reminders';
import { suggestionId } from '../lib/suggestions';
import { detailField, rememberedPay } from '../lib/payDetails';
import { nextId, nextRepeat, paidDoc, unpaidDoc } from './build';
import type { BillsActions } from './types';

// The bills actions, written once over a small storage interface that the live (Firestore) and the
// sample (memory) stores each implement (@huishouden/pwa-kit/store). Actions that offer Undo
// return one that writes back exactly the documents they touched, under the same ids.

/** Firestore collection names under households/{id}, by the data key that holds them. */
export const COLLECTIONS = {
  bills: 'bills',
  sources: 'billSources',
  syncs: 'billSync',
  answers: 'billSuggestions',
  contacts: 'contacts',
  // Pay details are money, kept from helpers and kids who read open contacts (pwa-kit contacts).
  contactPay: CONTACT_PAY_COLLECTION,
  settings: 'billSettings',
} as const satisfies Partial<Record<keyof BillsData, string>>;
export type DataKey = keyof typeof COLLECTIONS;

export type Op = KitOp<DataKey>;

export interface Backend extends KitBackend<DataKey> {
  /** Writes an email check's results and resolves once they are saved (its failure is shown where it ran). */
  writeSync(ops: Op[]): Promise<void>;
}

export function createActions(backend: Backend, read: () => BillsData, me: string, clock: () => number): BillsActions {
  const find = (col: DataKey, id: string) => (read()[col] as { id: string }[]).find((x) => x.id === id);
  const change = changes(backend, find);

  /**
   * The first time a bill or source is saved with a payee, a way of paying and its detail (the
   * Zelle phone, the portal's link), the payee remembers it, so the next bill to them fills in.
   */
  const remember = (data: PayFields & { payUrl?: string }, now: number): Op[] => {
    const contact = data.payeeContactId ? payeeContacts(read()).find((c) => c.id === data.payeeContactId) : undefined;
    const pay = rememberedPay(contact, data.payMethod, data[detailField(data.payMethod)]);
    return contact && pay ? [{ col: 'contactPay', id: contact.id, data: { ...pay, updatedAt: now, by: me }, merge: true }] : [];
  };

  return {
    markPaid: (bill) => {
      track('mark bill paid');
      const now = clock();
      const ops: Op[] = [{ col: 'bills', id: bill.id, data: paidDoc(bill, me, now) }];
      const next = nextRepeat(bill, me, now);
      if (next) ops.push({ col: 'bills', id: nextId(bill, next.due!), data: next });
      return change(ops);
    },
    skipBill: (bill) => {
      track('skip bill');
      const now = clock();
      const ops: Op[] = [{ col: 'bills', id: bill.id, data: { dismissed: true, updatedAt: now }, merge: true }];
      const next = nextRepeat(bill, me, now);
      if (next) ops.push({ col: 'bills', id: nextId(bill, next.due!), data: next });
      return change(ops);
    },
    unskipBill: (bill) => backend.write([{ col: 'bills', id: bill.id, data: { dismissed: false, updatedAt: clock() }, merge: true }]),
    markUnpaid: (bill) => backend.write([{ col: 'bills', id: bill.id, data: unpaidDoc(bill, clock()) }]),
    saveManualBill: (id, input) => {
      track('add bill');
      const now = clock();
      const existing = id ? read().bills.find((b) => b.id === id) : undefined;
      const data = manualBillDoc(input, existing?.createdBy ?? me, existing?.createdAt ?? now, now, existing);
      backend.write([{ col: 'bills', id: id ?? backend.newId('bills'), data }, ...remember(data, now)]);
    },
    // A manual bill is deleted; an email bill is hidden, so the next check doesn't bring it back.
    removeBill: (bill) =>
      backend.write([bill.source === 'manual' ? { col: 'bills', id: bill.id, data: null } : { col: 'bills', id: bill.id, data: { dismissed: true, updatedAt: clock() }, merge: true }]),
    restoreBill: (bill) => backend.write([{ col: 'bills', id: bill.id, data: withoutId(bill) }]),
    saveSource: (id, input) => {
      track('save bill source');
      const now = clock();
      const existing = id ? read().sources.find((s) => s.id === id) : undefined;
      const data = sourceDoc(input, existing?.createdBy ?? me, existing?.createdAt ?? now, now);
      const ops: Op[] = [{ col: 'sources', id: id ?? backend.newId('sources'), data }, ...remember(data, now)];
      // A renamed or re-kinded source renames its bills too.
      if (existing && (existing.name !== data.name || existing.kind !== data.kind)) {
        for (const b of read().bills.filter((x) => x.sourceId === id)) ops.push({ col: 'bills', id: b.id, data: { label: data.name, kind: data.kind, updatedAt: now }, merge: true });
      }
      backend.write(ops);
    },
    deleteSource: (source) => {
      const unpaid = read().bills.filter((b) => b.sourceId === source.id && b.status !== 'paid');
      return change([{ col: 'sources', id: source.id, data: null }, ...unpaid.map((b): Op => ({ col: 'bills', id: b.id, data: null }))]);
    },
    addSuggestion: (candidate, input) => {
      track('add suggested bill');
      const now = clock();
      const id = backend.newId('bills');
      const data = manualBillDoc(input, me, now, now);
      return change([
        { col: 'bills', id, data },
        { col: 'answers', id: suggestionId(candidate.merchantKey), data: { status: 'added', name: data.label, billId: id, by: me, at: now } satisfies BillSuggestionDoc },
      ]);
    },
    dismissSuggestion: (candidate, name) => {
      track('dismiss suggested bill');
      return change([{ col: 'answers', id: suggestionId(candidate.merchantKey), data: { status: 'dismissed', name: name.slice(0, 80), by: me, at: clock() } satisfies BillSuggestionDoc }]);
    },
    saveContact: (id, input) => {
      const now = clock();
      const existing = id ? read().contacts.find((c) => c.id === id) : undefined;
      const newId = id ?? backend.newId('contacts');
      const ops: Op[] = [{ col: 'contacts', id: newId, data: { ...cleanContact(input), createdAt: existing?.createdAt ?? now, ...(existing ? { updatedAt: now } : {}), by: me } }];
      // "How to pay them", when the dialog showed it: replaced whole, removed when emptied.
      if ('pay' in input) ops.push({ col: 'contactPay', id: newId, data: contactPayDoc(input.pay, me, now) });
      backend.write(ops);
      return newId;
    },
    saveSettings: (input) => {
      track('save bill settings');
      const data: BillSettings = {
        remindDefault: input.remindDefault,
        remindDays: cleanDays(input.remindDays),
        remindOverdue: input.remindOverdue,
        timeZone: reminderZone({ timeZone: input.timeZone }),
        updatedAt: clock(),
        updatedBy: me,
      };
      backend.write([{ col: 'settings', id: 'main', data }]);
    },
    applySync: (result) => {
      track('check email');
      return backend.writeSync([...result.writes.slice(0, 450).map((w): Op => ({ col: 'bills', id: w.id, data: w.data })), { col: 'syncs', id: me, data: result.status }]);
    },
  };
}
