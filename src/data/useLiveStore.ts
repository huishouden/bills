import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { manualBillDoc, sourceDoc, withoutId, type Bill, type BillSource, type BillSync } from '../lib/model';
import { auth, db } from './firebase';
import { gmailMailbox, requestGmailToken, storedGmailToken } from './gmail';
import { nextRepeat, paidDoc, unpaidDoc } from './build';
import type { BillsActions, BillsStore, MailAccess } from './types';

const clock = () => Date.now();

/**
 * The household's bills, sources and email-check status from Firestore. Writes are fire-and-forget:
 * the persistent cache applies them at once (also offline) and syncs later.
 */
export function useLiveStore(householdId: string, me: string, members: string[], onError: (message: string) => void): BillsStore {
  const [bills, setBills] = useState<Bill[]>([]);
  const [sources, setSources] = useState<BillSource[]>([]);
  const [syncs, setSyncs] = useState<BillSync[]>([]);
  const [answered, setAnswered] = useState({ bills: false, sources: false });
  const billsRef = useRef<Bill[]>([]);
  billsRef.current = bills;
  const sourcesRef = useRef<BillSource[]>([]);
  sourcesRef.current = sources;
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const base = `households/${householdId}`;

  useEffect(() => {
    const fail = (what: string) => (e: Error) => errorRef.current(readError(e, `Couldn't load ${what}`));
    const unsubs = [
      onSnapshot(
        collection(db, base, 'bills'),
        (s) => {
          setBills(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Bill, 'id'>) })));
          setAnswered((a) => ({ ...a, bills: true }));
        },
        (e) => {
          setAnswered((a) => ({ ...a, bills: true }));
          fail('the bills')(e);
        },
      ),
      onSnapshot(
        collection(db, base, 'billSources'),
        (s) => {
          setSources(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BillSource, 'id'>) })));
          setAnswered((a) => ({ ...a, sources: true }));
        },
        (e) => {
          setAnswered((a) => ({ ...a, sources: true }));
          fail('the bill sources')(e);
        },
      ),
      onSnapshot(
        collection(db, base, 'billSync'),
        (s) => setSyncs(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BillSync, 'id'>) }))),
        fail('the email checks'),
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [base]);

  const actions = useMemo<BillsActions>(() => {
    const report = (p: Promise<unknown>) => void p.catch((e) => errorRef.current(readError(e, "Couldn't save")));
    const billRef = (id: string) => doc(db, base, 'bills', id);
    return {
      markPaid: (bill) => {
        const now = clock();
        report(setDoc(billRef(bill.id), paidDoc(bill, me, now)));
        const next = nextRepeat(bill, me, now);
        const nextRef = next ? doc(collection(db, base, 'bills')) : null;
        if (next && nextRef) report(setDoc(nextRef, next));
        return () => {
          report(setDoc(billRef(bill.id), withoutId(bill)));
          if (nextRef) report(deleteDoc(nextRef));
        };
      },
      markUnpaid: (bill) => report(setDoc(billRef(bill.id), unpaidDoc(bill, clock()))),
      saveManualBill: (id, input) => {
        const now = clock();
        const existing = id ? billsRef.current.find((b) => b.id === id) : undefined;
        const ref = id ? billRef(id) : doc(collection(db, base, 'bills'));
        report(setDoc(ref, manualBillDoc(input, existing?.createdBy ?? me, existing?.createdAt ?? now, now, existing)));
      },
      removeBill: (bill) =>
        report(bill.source === 'manual' ? deleteDoc(billRef(bill.id)) : updateDoc(billRef(bill.id), { dismissed: true, updatedAt: clock() })),
      restoreBill: (bill) => report(setDoc(billRef(bill.id), withoutId(bill))),
      saveSource: (id, input) => {
        const now = clock();
        const ref = id ? doc(db, base, 'billSources', id) : doc(collection(db, base, 'billSources'));
        const existing = id ? sourcesRef.current.find((s) => s.id === id) : undefined;
        const data = sourceDoc(input, existing?.createdBy ?? me, existing?.createdAt ?? now, now);
        const batch = writeBatch(db);
        batch.set(ref, data);
        // A renamed or re-kinded source renames its bills too.
        if (existing && (existing.name !== data.name || existing.kind !== data.kind)) {
          for (const b of billsRef.current.filter((x) => x.sourceId === id)) batch.update(billRef(b.id), { label: data.name, kind: data.kind, updatedAt: now });
        }
        report(batch.commit());
      },
      deleteSource: (source) => {
        const unpaid = billsRef.current.filter((b) => b.sourceId === source.id && b.status !== 'paid');
        const batch = writeBatch(db);
        batch.delete(doc(db, base, 'billSources', source.id));
        for (const b of unpaid) batch.delete(billRef(b.id));
        report(batch.commit());
        return () => {
          const undo = writeBatch(db);
          undo.set(doc(db, base, 'billSources', source.id), withoutId(source));
          for (const b of unpaid) undo.set(billRef(b.id), withoutId(b));
          report(undo.commit());
        };
      },
      applySync: async (result) => {
        const batch = writeBatch(db);
        for (const w of result.writes.slice(0, 450)) batch.set(billRef(w.id), w.data);
        batch.set(doc(db, base, 'billSync', me), result.status);
        await batch.commit();
      },
    };
  }, [base, me]);

  const mail = useMemo<MailAccess>(
    () => ({
      stored: () => {
        const token = storedGmailToken(auth);
        return token ? gmailMailbox(token) : null;
      },
      request: async () => gmailMailbox(await requestGmailToken(auth)),
      note: 'Google will warn that the app is unverified the first time. Bills only reads statement emails and never changes your mail.',
    }),
    [],
  );

  return { data: { bills, sources, syncs }, ready: answered.bills && answered.sources, actions, mail, me, members, clock, sample: false };
}

export function readError(e: unknown, prefix: string): string {
  const code = (e as { code?: string })?.code;
  if (code === 'permission-denied') return `${prefix}: this household doesn't allow it yet.`;
  if (code === 'unavailable') return `${prefix}: offline. It will retry when the connection is back.`;
  return `${prefix}.`;
}
