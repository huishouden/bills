import { useMemo, useState } from 'react';
import { DEMO_MEMBERS, demoData, type BillsData } from '../lib/demo';
import { manualBillDoc, sourceDoc, type Bill } from '../lib/model';
import { sampleMailbox } from '../lib/sampleMailbox';
import { gmailMailbox } from '@huishouden/pwa-kit/gmail';
import { nextRepeat, paidDoc, unpaidDoc } from './build';
import type { BillsActions, BillsStore, MailAccess } from './types';

/**
 * Sample data kept in memory: the signed-out app is fully clickable, nothing is saved, and a reload
 * starts over. "Check email" reads an invented mailbox (or, in browser tests that set
 * `window.__gmailTestToken`, a stubbed Gmail API).
 */
export function useDemoStore(clock: () => number): BillsStore {
  const [data, setData] = useState<BillsData>(demoData);
  const me = DEMO_MEMBERS[0];

  const actions = useMemo<BillsActions>(() => {
    let seq = 0;
    const newId = () => `local-${Date.now()}-${seq++}`;
    const patch = (f: (d: BillsData) => BillsData) => setData(f);
    const upsertBill = (d: BillsData, bill: Bill): BillsData => ({ ...d, bills: [...d.bills.filter((b) => b.id !== bill.id), bill] });
    return {
      markPaid: (bill) => {
        const now = clock();
        const next = nextRepeat(bill, me, now);
        const nextId = next ? newId() : null;
        patch((d) => {
          let out = upsertBill(d, { id: bill.id, ...paidDoc(bill, me, now) });
          if (next && nextId) out = upsertBill(out, { id: nextId, ...next });
          return out;
        });
        return () =>
          patch((d) => {
            const out = upsertBill(d, bill);
            return { ...out, bills: out.bills.filter((b) => b.id !== nextId) };
          });
      },
      markUnpaid: (bill) => patch((d) => upsertBill(d, { id: bill.id, ...unpaidDoc(bill, clock()) })),
      saveManualBill: (id, input) =>
        patch((d) => {
          const now = clock();
          const existing = id ? d.bills.find((b) => b.id === id) : undefined;
          return upsertBill(d, { id: id ?? newId(), ...manualBillDoc(input, existing?.createdBy ?? me, existing?.createdAt ?? now, now, existing) });
        }),
      removeBill: (bill) =>
        patch((d) => (bill.source === 'manual' ? { ...d, bills: d.bills.filter((b) => b.id !== bill.id) } : upsertBill(d, { ...bill, dismissed: true }))),
      restoreBill: (bill) => patch((d) => upsertBill(d, bill)),
      saveSource: (id, input) =>
        patch((d) => {
          const now = clock();
          const existing = id ? d.sources.find((s) => s.id === id) : undefined;
          const source = { id: id ?? newId(), ...sourceDoc(input, existing?.createdBy ?? me, existing?.createdAt ?? now, now) };
          const bills = existing ? d.bills.map((b) => (b.sourceId === id ? { ...b, label: source.name, kind: source.kind } : b)) : d.bills;
          return { ...d, bills, sources: [...d.sources.filter((s) => s.id !== source.id), source] };
        }),
      deleteSource: (source) => {
        let removed: Bill[] = [];
        patch((d) => {
          removed = d.bills.filter((b) => b.sourceId === source.id && b.status !== 'paid');
          return { ...d, sources: d.sources.filter((s) => s.id !== source.id), bills: d.bills.filter((b) => !removed.includes(b)) };
        });
        return () => patch((d) => ({ ...d, sources: [...d.sources, source], bills: [...d.bills, ...removed] }));
      },
      applySync: async (result) =>
        patch((d) => {
          let out = d;
          for (const w of result.writes) out = upsertBill(out, { id: w.id, ...w.data });
          return { ...out, syncs: [...out.syncs.filter((s) => s.id !== me), { id: me, ...result.status }] };
        }),
    };
  }, [clock, me]);

  const mail = useMemo<MailAccess>(() => {
    const box = () => (typeof window !== 'undefined' && window.__gmailTestToken ? gmailMailbox(window.__gmailTestToken) : sampleMailbox(clock));
    return { stored: box, request: async () => box(), note: 'Sample mode reads an invented mailbox. Sign in to read your own.' };
  }, [clock]);

  return { data, ready: true, actions, mail, me, members: DEMO_MEMBERS, clock, sample: true };
}
