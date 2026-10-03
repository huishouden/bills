import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { commitOps } from '@huishouden/pwa-kit/firestore';
import { applyOps } from '@huishouden/pwa-kit/store';
import type { Bill, BillSource, BillSuggestion, BillSuggestionDoc, BillSync } from '../lib/model';
import { spendingSince, toCharge } from '../lib/suggestions';
import type { CardCharge } from '@huishouden/pwa-kit/recurring';
import { toYmd } from '@huishouden/pwa-kit/time';
import { AGENDA_APP, agendaItems, billAgenda, billRef as agendaRef } from '../lib/agenda';
import { removeAgenda, replaceAgenda, syncAgenda } from '@huishouden/pwa-kit/agenda';
import { syncTodos } from '@huishouden/pwa-kit/todos';
import { todoItems } from '../lib/todos';
import { auth, db } from './firebase';
import { readError } from '@huishouden/pwa-kit/feedback';
import { gmailMailbox, requestGmailToken, storedGmailToken } from '@huishouden/pwa-kit/gmail';
import { autopayRollovers } from './build';
import { COLLECTIONS, createActions, type Backend, type DataKey, type Op } from './actions';
import type { BillsStore, MailAccess } from './types';

const clock = () => Date.now();
/** How long after the bills change the to-do list is brought up to date (a burst of writes syncs once). */
const TODO_DELAY = 3000;
const path = (key: DataKey) => COLLECTIONS[key];

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
  const answersRef = useRef<BillSuggestion[]>([]);
  answersRef.current = answers;
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
      /** Each bill a write touched: its items as written (none once paid or removed), or their removal. */
      follow: (ops: Op[], bills: Bill[]) => {
        for (const id of new Set(ops.filter((o) => o.col === 'bills').map((o) => o.id))) {
          const bill = bills.find((b) => b.id === id);
          if (bill) void replaceAgenda(db, householdId, AGENDA_APP, agendaRef(id), billAgenda(bill, bills, clock()), { by: me }).catch(warn);
          else void removeAgenda(db, householdId, AGENDA_APP, agendaRef(id)).catch(warn);
        }
      },
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
      void commitOps(db, base, next.map((n): Op => ({ col: 'bills', id: n.id, data: n.data })), path).catch((e) => errorRef.current(readError(e, "Couldn't add the next autopay bills")));
    }
    agenda.sync([...billsRef.current, ...next.map((n) => ({ id: n.id, ...n.data }))]);
  }, [billsFromServer, agenda, base, me]);

  // The household's to-do list: bills to pay, on open and a few seconds after the bills change (a
  // bill paid or skipped here or on the portal leaves it). Only admins and members get this far.
  useEffect(() => {
    if (!billsFromServer) return;
    const timer = setTimeout(() => {
      void syncTodos(db, householdId, AGENDA_APP, todoItems(billsRef.current, clock()), { by: me }).catch((e) => console.warn('To-do update failed', e));
    }, TODO_DELAY);
    return () => clearTimeout(timer);
  }, [bills, billsFromServer, householdId, me]);

  const actions = useMemo(() => {
    const report = (p: Promise<unknown>) => void p.catch((e) => errorRef.current(readError(e, "Couldn't save")));
    const read = () => ({ bills: billsRef.current, sources: sourcesRef.current, syncs: [], charges: [], answers: answersRef.current });
    const backend: Backend = {
      newId: (key) => doc(collection(db, base, path(key))).id,
      write: (ops) => {
        report(commitOps(db, base, ops, path));
        agenda.follow(ops, applyOps(read(), ops).bills);
      },
      writeSync: async (ops) => {
        await commitOps(db, base, ops, path);
        // A check can add statements and replace older ones, so it reconciles the whole agenda.
        agenda.sync(applyOps(read(), ops).bills);
      },
    };
    return createActions(backend, read, me, clock);
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
