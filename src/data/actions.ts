import { changes, withoutId, type Backend as KitBackend, type Op as KitOp } from '@huishouden/pwa-kit/store';
import { track } from '@huishouden/pwa-kit/observability';
import type { BillsData } from '../lib/demo';
import { manualBillDoc, sourceDoc, type BillSuggestionDoc } from '../lib/model';
import { suggestionId } from '../lib/suggestions';
import { nextRepeat, paidDoc, unpaidDoc } from './build';
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

  return {
    markPaid: (bill) => {
      track('mark bill paid');
      const now = clock();
      const ops: Op[] = [{ col: 'bills', id: bill.id, data: paidDoc(bill, me, now) }];
      const next = nextRepeat(bill, me, now);
      if (next) ops.push({ col: 'bills', id: backend.newId('bills'), data: next });
      return change(ops);
    },
    markUnpaid: (bill) => backend.write([{ col: 'bills', id: bill.id, data: unpaidDoc(bill, clock()) }]),
    saveManualBill: (id, input) => {
      track('add bill');
      const now = clock();
      const existing = id ? read().bills.find((b) => b.id === id) : undefined;
      backend.write([{ col: 'bills', id: id ?? backend.newId('bills'), data: manualBillDoc(input, existing?.createdBy ?? me, existing?.createdAt ?? now, now, existing) }]);
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
      const ops: Op[] = [{ col: 'sources', id: id ?? backend.newId('sources'), data }];
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
    applySync: (result) => {
      track('check email');
      return backend.writeSync([...result.writes.slice(0, 450).map((w): Op => ({ col: 'bills', id: w.id, data: w.data })), { col: 'syncs', id: me, data: result.status }]);
    },
  };
}
