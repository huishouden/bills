// Read budgets of Bills' own read and sync paths (pwa-kit STANDARD.md "Read budgets"), on the
// emulators with the household's rules (`bun run e2e:emulator`, which `hh dev evidence` runs inside
// `firebase emulators:exec`): which bills an open reads, the publish of the agenda, to-dos and
// reminders, and the email check. Reads are counted from the SDK's own results as Firestore bills
// them (`readCounter().sdk`); the interleaving tests land another member's write before each read.
// Its own `bun test` process: it replaces firebase/firestore with the counted module for the process.
// The sample household (src/lib/demo.ts, invented) on its sample day. A change that raises a
// ceiling says why in its PR.
import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { expectReads, readCounter, writeBeforeEachRead } from '@huishouden/pwa-kit/read-test';
import { e2eProject, e2eTarget, seedTestHousehold, testHousehold, writeTestDocs, type TestHousehold } from '@huishouden/pwa-kit/staging';
import { agendaDoc } from '@huishouden/pwa-kit/agenda';
import { todoDoc } from '@huishouden/pwa-kit/todos';
import { DEMO_NOW, DEMO_SOURCES, demoData, payeeContacts } from '../src/lib/demo';
import { sampleMailbox } from '../src/lib/sampleMailbox';
import { syncFromMailbox } from '../src/lib/emailSync';
import type { Bill } from '../src/lib/model';

const real = await import('firebase/firestore');
const counter = readCounter();
mock.module('firebase/firestore', () => counter.sdk(real));
const { connectFirestoreEmulator, getDocs, initializeFirestore, memoryLocalCache, terminate } = await import('firebase/firestore');
const { commitOps } = await import('@huishouden/pwa-kit/firestore');
const { billsQuery } = await import('../src/data/billsQuery');
const { publishAgenda, publishReminders, publishTodos } = await import('../src/data/publish');

const emulator = e2eTarget() === 'emulator';
const NOW = DEMO_NOW;
const DAY = 86_400_000;
// The rules take only the suite's own addresses.
const URL = 'https://huishouden-staging.web.app/bills/';

let hh: TestHousehold;
let app: FirebaseApp;
let db: ReturnType<typeof real.getFirestore>;
let admin: string;
const data = demoData();
const pay = { sources: data.sources, contacts: payeeContacts(data) };
const ctx = { sources: data.sources, contacts: pay.contacts, settings: null };
// Bills over long before the sample day, never read again: two years of paid statements, two that
// kept `status: 'due'` when they ended (an autopay bill a rollover followed, a removed one), and two
// statements that carried no due date (one paid, one removed).
const power = data.bills.find((b) => b.sourceId === 'power')!;
const OLD = 10;
const old: Bill[] = [
  ...Array.from({ length: 6 }, (_, i) => ({
    ...power,
    id: `power-old-${i}`,
    due: `2029-0${i + 1}-20`,
    status: 'paid' as const,
    paidAt: NOW - (700 - i * 30) * DAY,
    paidVia: 'email' as const,
    createdAt: NOW - (720 - i * 30) * DAY,
    updatedAt: NOW - (700 - i * 30) * DAY,
  })),
  { ...data.bills.find((b) => b.id === 'manual-hulu')!, id: 'manual-hulu~2030-07-28', due: '2030-07-28', createdAt: NOW - 320 * DAY, updatedAt: NOW - 320 * DAY },
  { ...power, id: 'power-removed', due: '2030-06-20', dismissed: true, createdAt: NOW - 340 * DAY, updatedAt: NOW - 300 * DAY },
  { ...power, id: 'power-undated-paid', due: null, status: 'paid', paidAt: NOW - 250 * DAY, paidBy: 'seed@example.com', paidVia: 'member', createdAt: NOW - 260 * DAY, updatedAt: NOW - 250 * DAY },
  { ...power, id: 'power-undated-removed', due: null, dismissed: true, createdAt: NOW - 230 * DAY, updatedAt: NOW - 220 * DAY },
];

const strip = ({ id: _id, ...doc }: { id: string }) => doc;

beforeAll(async () => {
  if (!emulator) return;
  const household = testHousehold('bills-reads-sdk');
  admin = household.users.admin.email;
  const docs: Record<string, Record<string, unknown>> = {};
  for (const b of [...data.bills, ...old]) docs[`bills/${b.id}`] = strip(b);
  for (const s of DEMO_SOURCES) docs[`billSources/${s.id}`] = strip(s);
  hh = await seedTestHousehold({ household, docs });
  app = initializeApp({ apiKey: 'demo-key', projectId: e2eProject(), appId: 'demo' }, `reads-${hh.id}`);
  db = initializeFirestore(app, { localCache: memoryLocalCache() });
  connectFirestoreEmulator(db, process.env.HH_EMULATOR_HOST || '127.0.0.1', Number(process.env.HH_EMULATOR_FIRESTORE_PORT || 8080), {
    mockUserToken: { sub: hh.users.admin.uid, email: admin, email_verified: true },
  });
});

afterAll(async () => {
  if (!emulator) return;
  await terminate(db);
  await deleteApp(app);
});

const base = () => `households/${hh.id}`;
const loadBills = async () => (await getDocs(billsQuery(db, base(), NOW))).docs.map((d) => ({ id: d.id, ...d.data() }) as Bill);
const publish = (bills: Bill[], published: null | Storage = null) =>
  Promise.all([publishAgenda(db, hh.id, admin, bills, { now: NOW, url: URL, pay, published }), publishTodos(db, hh.id, admin, bills, { now: NOW, url: URL, pay, published })]);

describe.skipIf(!emulator)('the bills an open reads', () => {
  test(`the sample's ${data.bills.length} bills, not the ${OLD} over long ago (paid, left due by a rollover or a removal, or never dated)`, async () => {
    const { value } = await expectReads(loadBills, { max: data.bills.length, min: data.bills.length, counter, label: 'bills listener' });
    expect(value.some((b) => b.id.startsWith('power-old-'))).toBe(false);
  });
});

describe.skipIf(!emulator)('publishing (agenda, to-dos, reminders): one query each, none when this device already published the same', () => {
  test('first, again, and again with this device\'s note', async () => {
    const bills = data.bills;
    // Nothing published yet: three queries that find nothing, billed one read each.
    await expectReads(async () => {
      await publish(bills);
      await publishReminders(db, hh.id, admin, bills, ctx, { now: NOW, published: null });
    }, { max: 3, min: 3, counter, label: 'Bills publish, first' });
    // Again without the note: each query returns what the first wrote.
    const { value, reads } = await expectReads(async () => {
      const [agenda, todos] = await publish(bills);
      const reminders = await publishReminders(db, hh.id, admin, bills, ctx, { now: NOW, published: null });
      return agenda.unchanged + todos.unchanged + reminders.unchanged;
    }, { max: 16, min: 16, counter, label: 'Bills publish, again' });
    expect(reads).toBe(value);
    // With the note of what this device published: nothing read.
    const notes = new Map<string, string>();
    const store = { getItem: (k: string) => notes.get(k) ?? null, setItem: (k: string, v: string) => void notes.set(k, v), removeItem: (k: string) => void notes.delete(k), key: (i: number) => [...notes.keys()][i] ?? null, clear: () => notes.clear(), get length() { return notes.size; } };
    await publish(bills, store);
    await expectReads(() => publish(bills, store), { max: 0, counter, label: 'Bills publish, published' });
  });
});

describe.skipIf(!emulator)('the email check: statements from the mailbox, then the agenda and to-dos once', () => {
  test('interleaving: another member adds an agenda item and a to-do before each read; one pass', async () => {
    const bills = await loadBills();
    const result = await syncFromMailbox(sampleMailbox(() => NOW), data.sources, bills, admin, NOW);
    expect(result.status.errors).toEqual([]);
    let n = 0;
    const stray = (i: number) => ({
      [`agenda/bills_bill_stray${i}`]: agendaDoc('bills', { ref: `bill:stray${i}`, kind: 'bill', title: `Old ${i}`, start: NOW + DAY, allDay: true, url: URL, private: true }, admin, NOW),
      [`todos/bills:bill:stray${i}`]: todoDoc('bills', { ref: `bill:stray${i}`, title: `Old ${i}`, createdAt: NOW - DAY, url: URL, private: true }, admin, NOW),
    });
    const { value, reads } = await expectReads(
      async () => {
        await commitOps(db, base(), result.writes.map((w) => ({ col: 'bills', id: w.id, data: w.data as unknown as Record<string, unknown> })));
        const merged = new Map(bills.map((b) => [b.id, b]));
        for (const w of result.writes) merged.set(w.id, { id: w.id, ...w.data });
        return publish([...merged.values()]);
      },
      { max: 17, min: 17, counter, label: 'email check with a write before each read', beforeRead: writeBeforeEachRead(() => writeTestDocs(hh, stray(++n))) },
    );
    // Both reads go out together, so each list's one query saw both strays and removed them (with
    // the item the check's statements made stale): 17 reads in all, nothing read twice.
    expect(n).toBe(2);
    expect(reads).toBe(17);
    expect(value.map((r) => r.deleted)).toEqual([3, 3]);
  });
});
