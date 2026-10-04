import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { commitOps } from '@huishouden/pwa-kit/firestore';
import { applyOps } from '@huishouden/pwa-kit/store';
import type { Bill, BillSettings, BillSource, BillSuggestion, BillSuggestionDoc, BillSync } from '../lib/model';
import { watchContacts, type Contact } from '@huishouden/pwa-kit/contacts';
import { localizeReminders, syncReminders } from '@huishouden/pwa-kit/reminders';
import { billReminders } from '../lib/reminders';
import type { PayContext } from '../lib/pay';
import { spendingSince, toCharge } from '../lib/suggestions';
import type { CardCharge } from '@huishouden/pwa-kit/recurring';
import { toYmd } from '@huishouden/pwa-kit/time';
import { AGENDA_APP, agendaItems, billAgenda, billRef as agendaRef } from '../lib/agenda';
import { localizeAgenda, removeAgenda, replaceAgenda, syncAgenda } from '@huishouden/pwa-kit/agenda';
import { localizeTodos, syncTodos } from '@huishouden/pwa-kit/todos';
import { todoItems } from '../lib/todos';
import { auth, db } from './firebase';
import { readError } from '@huishouden/pwa-kit/feedback';
import { t } from '../i18n';
import { gmailMailbox, requestGmailToken, storedGmailToken } from '@huishouden/pwa-kit/gmail';
import { autopayRollovers } from './build';
import { COLLECTIONS, createActions, type Backend, type DataKey, type Op } from './actions';
import type { BillsStore, MailAccess } from './types';

const clock = () => Date.now();
const path = (key: DataKey) => COLLECTIONS[key];

/**
 * The household's bills, sources and email-check status from Firestore. Writes are fire-and-forget:
 * the persistent cache applies them at once (also offline) and syncs later.
 */
export function useLiveStore(householdId: string, me: string, members: string[], payers: string[], onError: (message: string) => void): BillsStore {
  const [bills, setBills] = useState<Bill[]>([]);
  const [sources, setSources] = useState<BillSource[]>([]);
  const [syncs, setSyncs] = useState<BillSync[]>([]);
  const [charges, setCharges] = useState<CardCharge[]>([]);
  const [answers, setAnswers] = useState<BillSuggestion[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [settings, setSettings] = useState<(BillSettings & { id: string })[]>([]);
  // Reminders wait for contacts and settings too, so a first sync never drops a payee or a default.
  const [extrasLoaded, setExtrasLoaded] = useState({ contacts: false, settings: false });
  const [answered, setAnswered] = useState({ bills: false, sources: false });
  // The first bills snapshot from the server (not the offline cache): when the agenda is reconciled.
  const [billsFromServer, setBillsFromServer] = useState(false);
  const billsRef = useRef<Bill[]>([]);
  billsRef.current = bills;
  const sourcesRef = useRef<BillSource[]>([]);
  sourcesRef.current = sources;
  const answersRef = useRef<BillSuggestion[]>([]);
  answersRef.current = answers;
  const contactsRef = useRef<Contact[]>([]);
  contactsRef.current = contacts;
  const payRef = useRef<PayContext>({ sources, contacts });
  payRef.current = { sources, contacts };
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const base = `households/${householdId}`;

  useEffect(() => {
    const fail = (prefix: string) => (e: Error) => errorRef.current(readError(e, prefix));
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
          fail(t('live.loadBills'))(e);
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
          fail(t('live.loadSources'))(e);
        },
      ),
      onSnapshot(
        collection(db, base, 'billSync'),
        (s) => setSyncs(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BillSync, 'id'>) }))),
        fail(t('live.loadSyncs')),
      ),
      onSnapshot(
        collection(db, base, 'billSuggestions'),
        (s) => setAnswers(s.docs.map((d) => ({ id: d.id, ...(d.data() as BillSuggestionDoc) }))),
        fail(t('live.loadSuggestions')),
      ),
      // Every app's contacts: the landlord may have been added in Home.
      watchContacts(
        db,
        householdId,
        (c) => {
          setContacts(c);
          setExtrasLoaded((l) => ({ ...l, contacts: true }));
        },
        {
          // Bills is for admins and members only, so contacts carry their pay details (contactPay).
          by: me,
          onError: (e) => {
            setExtrasLoaded((l) => ({ ...l, contacts: true }));
            fail(t('live.loadContacts'))(e);
          },
        },
      ),
      onSnapshot(
        doc(db, base, 'billSettings', 'main'),
        (d) => {
          setSettings(d.exists() ? [{ id: d.id, ...(d.data() as BillSettings) }] : []);
          setExtrasLoaded((l) => ({ ...l, settings: true }));
        },
        (e) => {
          setExtrasLoaded((l) => ({ ...l, settings: true }));
          fail(t('live.loadSettings'))(e);
        },
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
  }, [base, householdId, me]);

  // The household agenda follows every write. It is a copy for the portal: a failed agenda write
  // is logged, never shown, and the next open's reconcile repairs it.
  const agenda = useMemo(() => {
    const warn = (e: unknown) => console.warn('Agenda update failed', e);
    return {
      /** Each bill a write touched: its items as written (none once paid or removed), or their removal. */
      follow: (ops: Op[], bills: Bill[]) => {
        for (const id of new Set(ops.filter((o) => o.col === 'bills').map((o) => o.id))) {
          const bill = bills.find((b) => b.id === id);
          // Every language's words, so the portal shows each reader their own.
          if (bill) void localizeAgenda(() => billAgenda(bill, bills, clock(), undefined, payRef.current)).then((items) => replaceAgenda(db, householdId, AGENDA_APP, agendaRef(id), items, { by: me })).catch(warn);
          else void removeAgenda(db, householdId, AGENDA_APP, agendaRef(id)).catch(warn);
        }
      },
      sync: (bills: Bill[]) => void localizeAgenda(() => agendaItems(bills, clock(), undefined, payRef.current)).then((items) => syncAgenda(db, householdId, AGENDA_APP, items, { by: me })).catch(warn),
      // The household's to-do list (bills to pay), written whole: on open and after every write here,
      // at once, so it is up to date even if the app is closed right after. Paid or skipped on the
      // portal, the item is removed there.
      todos: (bills: Bill[]) =>
        void localizeTodos(() => todoItems(bills, clock(), undefined, undefined, payRef.current))
          .then((items) => syncTodos(db, householdId, AGENDA_APP, items, { by: me }))
          .catch((e) => console.warn('To-do update failed', e)),
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
      void commitOps(db, base, next.map((n): Op => ({ col: 'bills', id: n.id, data: n.data })), path).catch((e) => errorRef.current(readError(e, t('live.addNext'))));
    }
    const all = [...billsRef.current, ...next.map((n) => ({ id: n.id, ...n.data }))];
    agenda.sync(all);
    agenda.todos(all);
  }, [billsFromServer, agenda, base, me]);

  const actions = useMemo(() => {
    const report = (p: Promise<unknown>) => void p.catch((e) => errorRef.current(readError(e, t('live.save'))));
    const read = () => ({ bills: billsRef.current, sources: sourcesRef.current, syncs: [], charges: [], answers: answersRef.current, contacts: contactsRef.current, contactPay: [], settings: [] });
    const backend: Backend = {
      newId: (key) => doc(collection(db, base, path(key))).id,
      write: (ops) => {
        report(commitOps(db, base, ops, path));
        const bills = applyOps(read(), ops).bills;
        agenda.follow(ops, bills);
        if (ops.some((o) => o.col === 'bills')) agenda.todos(bills);
      },
      writeSync: async (ops) => {
        await commitOps(db, base, ops, path);
        // A check can add statements and replace older ones, so it reconciles the whole agenda.
        const bills = applyOps(read(), ops).bills;
        agenda.sync(bills);
        agenda.todos(bills);
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
      get note() {
        return t('email.noteLive');
      },
    }),
    [],
  );

  // Reminders follow the bills: worked out from everything loaded, written when they change (a
  // bill paid, skipped, removed or re-dated, a setting changed) and when the day turns. Paid and
  // skipped bills have none, so their pending reminders are deleted here.
  const day = toYmd(clock());
  const remindersReady = billsFromServer && answered.sources && extrasLoaded.contacts && extrasLoaded.settings;
  const lastReminders = useRef('');
  useEffect(() => {
    if (!remindersReady) return;
    const id = setTimeout(() => {
      const now = clock();
      const build = () => billReminders(bills, { sources, contacts, settings: settings[0] ?? null, now });
      const signature = JSON.stringify(build().map((r) => [r.id, r.title, r.body, r.recipients]));
      if (signature === lastReminders.current) return;
      lastReminders.current = signature;
      localizeReminders(build)
        .then((list) => syncReminders(db, householdId, AGENDA_APP, list, me, now))
        .catch((e) => {
          lastReminders.current = '';
          console.warn('Reminder update failed', e);
        });
    }, 1500);
    return () => clearTimeout(id);
  }, [remindersReady, bills, sources, contacts, settings, householdId, me, day]);

  const live = useMemo(() => ({ householdId, email: me }), [householdId, me]);
  return {
    data: { bills, sources, syncs, charges, answers, contacts, contactPay: [], settings },
    ready: answered.bills && answered.sources,
    actions,
    mail,
    me,
    members,
    payers,
    live,
    clock,
    sample: false,
  };
}
