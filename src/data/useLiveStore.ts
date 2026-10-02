import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { deleteDoc, setDoc, updateDoc, writeBatch } from '@huishouden/pwa-kit/firestore';
import { manualBillDoc, sourceDoc, withoutId, type Bill, type BillSource, type BillSync } from '../lib/model';
import { AGENDA_APP, agendaItems, billAgenda, billRef as agendaRef } from '../lib/agenda';
import { removeAgenda, replaceAgenda, syncAgenda } from '@huishouden/pwa-kit/agenda';
import { auth, db } from './firebase';
import { readError } from '@huishouden/pwa-kit/feedback';
import { gmailMailbox, requestGmailToken, storedGmailToken } from '@huishouden/pwa-kit/gmail';
import { nextRepeat, paidDoc, unpaidDoc } from './build';
import type { BillsActions, BillsStore, MailAccess } from './types';
import { track } from '@huishouden/pwa-kit/observability';

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
  // The first bills snapshot from the server (not the offline cache): when the agenda is reconciled.
  const [billsFromServer, setBillsFromServer] = useState(false);
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
        { includeMetadataChanges: true },
        (s) => {
          setBills(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Bill, 'id'>) })));
          setAnswered((a) => ({ ...a, bills: true }));
          if (!s.metadata.fromCache) setBillsFromServer(true);
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

  // The household agenda follows every write. It is a copy for the portal: a failed agenda write
  // is logged, never shown, and the next open's reconcile repairs it.
  const agenda = useMemo(() => {
    const warn = (e: unknown) => console.warn('Agenda update failed', e);
    return {
      publish: (bill: Bill) =>
        void replaceAgenda(db, householdId, AGENDA_APP, agendaRef(bill.id), billAgenda(bill, billsRef.current, clock()), { by: me }).catch(warn),
      unpublish: (id: string) => void removeAgenda(db, householdId, AGENDA_APP, agendaRef(id)).catch(warn),
      sync: (bills: Bill[]) => void syncAgenda(db, householdId, AGENDA_APP, agendaItems(bills, clock()), { by: me }).catch(warn),
    };
  }, [householdId, me]);

  const synced = useRef(false);
  useEffect(() => {
    if (!billsFromServer || synced.current) return;
    synced.current = true;
    agenda.sync(billsRef.current);
  }, [billsFromServer, agenda]);

  const actions = useMemo<BillsActions>(() => {
    const report = (p: Promise<unknown>) => void p.catch((e) => errorRef.current(readError(e, "Couldn't save")));
    const billRef = (id: string) => doc(db, base, 'bills', id);
    return {
      markPaid: (bill) => {
        track('mark bill paid');
        const now = clock();
        report(setDoc(billRef(bill.id), paidDoc(bill, me, now)));
        agenda.unpublish(bill.id);
        const next = nextRepeat(bill, me, now);
        const nextRef = next ? doc(collection(db, base, 'bills')) : null;
        if (next && nextRef) {
          report(setDoc(nextRef, next));
          agenda.publish({ id: nextRef.id, ...next });
        }
        return () => {
          report(setDoc(billRef(bill.id), withoutId(bill)));
          agenda.publish(bill);
          if (nextRef) {
            report(deleteDoc(nextRef));
            agenda.unpublish(nextRef.id);
          }
        };
      },
      markUnpaid: (bill) => {
        const data = unpaidDoc(bill, clock());
        report(setDoc(billRef(bill.id), data));
        agenda.publish({ id: bill.id, ...data });
      },
      saveManualBill: (id, input) => {
        track('add bill');
        const now = clock();
        const existing = id ? billsRef.current.find((b) => b.id === id) : undefined;
        const ref = id ? billRef(id) : doc(collection(db, base, 'bills'));
        const data = manualBillDoc(input, existing?.createdBy ?? me, existing?.createdAt ?? now, now, existing);
        report(setDoc(ref, data));
        agenda.publish({ id: ref.id, ...data });
      },
      removeBill: (bill) => {
        report(bill.source === 'manual' ? deleteDoc(billRef(bill.id)) : updateDoc(billRef(bill.id), { dismissed: true, updatedAt: clock() }));
        agenda.unpublish(bill.id);
      },
      restoreBill: (bill) => {
        report(setDoc(billRef(bill.id), withoutId(bill)));
        agenda.publish(bill);
      },
      saveSource: (id, input) => {
        track('save bill source');
        const now = clock();
        const ref = id ? doc(db, base, 'billSources', id) : doc(collection(db, base, 'billSources'));
        const existing = id ? sourcesRef.current.find((s) => s.id === id) : undefined;
        const data = sourceDoc(input, existing?.createdBy ?? me, existing?.createdAt ?? now, now);
        const batch = writeBatch(db);
        batch.set(ref, data);
        // A renamed or re-kinded source renames its bills too.
        if (existing && (existing.name !== data.name || existing.kind !== data.kind)) {
          for (const b of billsRef.current.filter((x) => x.sourceId === id)) {
            batch.update(billRef(b.id), { label: data.name, kind: data.kind, updatedAt: now });
            agenda.publish({ ...b, label: data.name, kind: data.kind, updatedAt: now });
          }
        }
        report(batch.commit());
      },
      deleteSource: (source) => {
        const unpaid = billsRef.current.filter((b) => b.sourceId === source.id && b.status !== 'paid');
        const batch = writeBatch(db);
        batch.delete(doc(db, base, 'billSources', source.id));
        for (const b of unpaid) batch.delete(billRef(b.id));
        report(batch.commit());
        for (const b of unpaid) agenda.unpublish(b.id);
        return () => {
          const undo = writeBatch(db);
          undo.set(doc(db, base, 'billSources', source.id), withoutId(source));
          for (const b of unpaid) undo.set(billRef(b.id), withoutId(b));
          report(undo.commit());
          for (const b of unpaid) agenda.publish(b);
        };
      },
      applySync: async (result) => {
        track('check email');
        const writes = result.writes.slice(0, 450);
        const batch = writeBatch(db);
        for (const w of writes) batch.set(billRef(w.id), w.data);
        batch.set(doc(db, base, 'billSync', me), result.status);
        await batch.commit();
        // A sync can add statements and replace older ones, so it reconciles the whole agenda.
        const written = new Map(writes.map((w) => [w.id, { id: w.id, ...w.data }]));
        agenda.sync([...billsRef.current.filter((b) => !written.has(b.id)), ...written.values()]);
      },
    };
  }, [base, me, agenda]);

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
