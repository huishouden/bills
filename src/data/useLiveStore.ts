import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { deleteDoc, setDoc, updateDoc, writeBatch } from '@huishouden/pwa-kit/firestore';
import { manualBillDoc, sourceDoc, withoutId, type Bill, type BillSource, type BillSuggestion, type BillSuggestionDoc, type BillSync } from '../lib/model';
import { spendingSince, suggestionId, toCharge } from '../lib/suggestions';
import type { CardCharge } from '@huishouden/pwa-kit/recurring';
import { toYmd } from '@huishouden/pwa-kit/time';
import { AGENDA_APP, agendaItems, billAgenda, billRef as agendaRef } from '../lib/agenda';
import { removeAgenda, replaceAgenda, syncAgenda } from '@huishouden/pwa-kit/agenda';
import { auth, db } from './firebase';
import { readError } from '@huishouden/pwa-kit/feedback';
import { gmailMailbox, requestGmailToken, storedGmailToken } from '@huishouden/pwa-kit/gmail';
import { autopayRollovers, nextRepeat, paidDoc, unpaidDoc } from './build';
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
  const [charges, setCharges] = useState<CardCharge[]>([]);
  const [answers, setAnswers] = useState<BillSuggestion[]>([]);
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
      onSnapshot(
        collection(db, base, 'billSuggestions'),
        (s) => setAnswers(s.docs.map((d) => ({ id: d.id, ...(d.data() as BillSuggestionDoc) }))),
        fail('the suggested bills'),
      ),
      // Card spending from Huishouden Spending, read only, for "Possible regular bills". A failure
      // here only hides the suggestions, so it is logged rather than shown.
      onSnapshot(
        query(collection(db, base, 'spendingTransactions'), where('date', '>=', spendingSince(toYmd(clock())))),
        (s) => setCharges(s.docs.flatMap((d) => toCharge(d.data()) ?? [])),
        (e) => console.warn('Card spending unavailable', e),
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
    // Repeating bills on autopay that came due since anyone looked get their next one first.
    const now = clock();
    const next = autopayRollovers(billsRef.current, toYmd(now), me, now);
    if (next.length) {
      const batch = writeBatch(db);
      for (const n of next) batch.set(doc(db, base, 'bills', n.id), n.data);
      void batch.commit().catch((e) => errorRef.current(readError(e, "Couldn't add the next autopay bills")));
    }
    agenda.sync([...billsRef.current, ...next.map((n) => ({ id: n.id, ...n.data }))]);
  }, [billsFromServer, agenda, base, me]);

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
      addSuggestion: (candidate, input) => {
        track('add suggested bill');
        const now = clock();
        const ref = doc(collection(db, base, 'bills'));
        const answer = doc(db, base, 'billSuggestions', suggestionId(candidate.merchantKey));
        const data = manualBillDoc(input, me, now, now);
        const batch = writeBatch(db);
        batch.set(ref, data);
        batch.set(answer, { status: 'added', name: data.label, billId: ref.id, by: me, at: now } satisfies BillSuggestionDoc);
        report(batch.commit());
        agenda.publish({ id: ref.id, ...data });
        return () => {
          const undo = writeBatch(db);
          undo.delete(ref);
          undo.delete(answer);
          report(undo.commit());
          agenda.unpublish(ref.id);
        };
      },
      dismissSuggestion: (candidate, name) => {
        track('dismiss suggested bill');
        const answer = doc(db, base, 'billSuggestions', suggestionId(candidate.merchantKey));
        report(setDoc(answer, { status: 'dismissed', name: name.slice(0, 80), by: me, at: clock() } satisfies BillSuggestionDoc));
        return () => report(deleteDoc(answer));
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

  return { data: { bills, sources, syncs, charges, answers }, ready: answered.bills && answered.sources, actions, mail, me, members, clock, sample: false };
}
