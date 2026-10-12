import { expect, test, type Browser, type Page } from '@playwright/test';
import { expectPageReads, resetPageReads, useTestHousehold } from '@huishouden/pwa-kit/e2e';
import { testHousehold } from '@huishouden/pwa-kit/staging';

// Read budgets (pwa-kit STANDARD.md "Read budgets"): what opening Bills costs a household in
// Firestore reads, on the emulators with a build that counts them (`expectPageReads`), each in a
// fresh browser context (a first open, nothing cached). A change that raises a ceiling says why in
// its PR. An invented household: two bill sources, three open bills, two paid last month; four
// paid two years ago, two over long ago but still due and one undated paid long ago (none of these
// seven read: src/data/billsQuery.ts); two card charges from Spending, the reminder settings, a landlord.
const NOW = Date.now();
const DAY = 86_400_000;
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
const { admin } = testHousehold('reads').users;
const by = admin.email;
const usd = (amount: string) => ({ amount, currency: 'USD' });

const source = (id: string, name: string, kind: string) => ({ [`billSources/${id}`]: { name, kind, from: `billing@${id}.example.com`, autopay: null, createdAt: NOW - 400 * DAY, createdBy: by, updatedAt: NOW - 400 * DAY } });
function bill(id: string, label: string, due: number, extra: Record<string, unknown> = {}) {
  return { [`bills/${id}`]: { schema: 'bill/v1', source: 'manual', kind: 'other', label, due: ymd(due), amountDue: usd('50.00'), status: 'due', autopay: { enrolled: false }, createdAt: due - 20 * DAY, createdBy: by, updatedAt: due - 20 * DAY, ...extra } };
}
const paid = (at: number) => ({ status: 'paid', paidAt: at, paidBy: by, paidVia: 'member', updatedAt: at });
const charge = (i: number) => ({ [`spendingTransactions/c${i}`]: { date: ymd(NOW - (i * 30 + 5) * DAY), description: 'TESTSTREAM MEDIA', amount: 9.99, category: 'Subscriptions & Tech', card: 'Test Card', type: 'Sale', source: 'statement', createdAt: NOW, by } });

const hh = useTestHousehold(test, {
  scope: 'reads',
  docs: {
    ...source('power', 'Test Power', 'electric'),
    ...source('water', 'Test Water', 'water'),
    ...bill('rent', 'Test Rent', NOW + 3 * DAY, { repeat: 'monthly', remind: { on: true, days: [3, 0], overdue: true } }),
    ...bill('power-now', 'Test Power', NOW + 10 * DAY, { source: 'email', sourceId: 'power', kind: 'electric' }),
    ...bill('gym', 'Test Gym', NOW + 20 * DAY),
    ...bill('rent-last', 'Test Rent', NOW - 27 * DAY, { repeat: 'monthly', ...paid(NOW - 28 * DAY) }),
    ...bill('power-last', 'Test Power', NOW - 20 * DAY, { source: 'email', sourceId: 'power', kind: 'electric', ...paid(NOW - 21 * DAY) }),
    ...Object.assign({}, ...[1, 2, 3, 4].map((i) => bill(`old-${i}`, 'Test Power', NOW - (700 + i * 30) * DAY, paid(NOW - (700 + i * 30) * DAY)))),
    // Over, but still `status: 'due'`: an autopay bill a rollover followed, a removed one.
    ...bill('gym-old', 'Test Gym', NOW - 300 * DAY, { repeat: 'monthly', autopay: { enrolled: true } }),
    ...bill('removed-old', 'Test Power', NOW - 280 * DAY, { dismissed: true }),
    // A statement without a due date, paid long ago.
    ...bill('undated-old', 'Test Water', NOW - 250 * DAY, { due: null, ...paid(NOW - 240 * DAY) }),
    'billSettings/main': { remindDefault: 'none', remindDays: [3, 0], remindOverdue: true, updatedAt: NOW - DAY, updatedBy: by },
    'contacts/landlord': { name: 'Test Rentals', role: 'Landlord', phone: '555-0100', apps: ['bills'], private: false, createdAt: NOW - DAY, by },
    ...charge(1),
    ...charge(2),
  },
});

// One open at a time: another open's writes (a sign-in's profile, its publish) would reach this
// page's listeners and be counted as its reads.
test.describe.configure({ mode: 'serial', timeout: 90_000 });

const loaded = (page: Page) => expect(page.getByRole('listitem', { name: 'Test Gym' })).toBeVisible({ timeout: 30_000 });
const refused = (page: Page) => expect(page.getByText('Only admins and members can see the household’s money.')).toBeVisible({ timeout: 30_000 });

// Each person has used Bills before on another device: a first sign-in's own writes (the member's
// profile, their language) are done, so they don't land in a measured open as changes its
// listeners bill, early or late.
test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  for (const [as, ready] of [['admin', loaded], ['member', loaded], ['helper', refused]] as const) {
    const page = await hh.open(browser, as);
    await ready(page);
    await page.waitForTimeout(3000);
    await page.close();
  }
});

async function firstOpen(browser: Browser, as: 'admin' | 'member' | 'helper', ready: (page: Page) => Promise<unknown>, max: number, label: string) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  try {
    await expectPageReads(
      page,
      async () => {
        await hh.signIn(page, as, './');
        await ready(page);
      },
      // Past the reminders, written 1.5 s after everything is in.
      { max, min: max, label, settleMs: 3000 },
    );
  } catch (e) {
    await context.close();
    throw e;
  }
  // The caller closes the context, after any checks of its own on the page.
  return page;
}

// An admin: the household (and the change the sign-in writes to it), the bills (5 of 12), sources,
// email checks, card suggestions' answers, contacts and their pay details, the reminder settings,
// two card charges: 15. The publish's queries (agenda, to-dos, reminders) don't run on the local
// preview, whose links are http; e2e/reads.sdk.ts budgets them. The tabs share the listeners.
test('opening Bills (Upcoming), signed in as an admin; History and Sources read nothing more', async ({ browser }) => {
  const page = await firstOpen(browser, 'admin', loaded, 15, 'Bills Upcoming, admin');
  try {
    for (const tab of ['History', 'Sources']) {
      await resetPageReads(page);
      await expectPageReads(page, () => page.getByRole('button', { name: tab, exact: true }).click(), { max: 0, min: 0, label: `Bills ${tab}, admin` });
    }
  } finally {
    await page.context().close();
  }
});

// A member reads what an admin does.
test('opening Bills (Upcoming), signed in as a member', async ({ browser }) => {
  const page = await firstOpen(browser, 'member', loaded, 15, 'Bills Upcoming, member');
  await page.context().close();
});

// Helpers and kids never see money: the household and the refusal, no listener on the bills.
test('opening Bills, signed in as a helper: nothing of the money read', async ({ browser }) => {
  const page = await firstOpen(browser, 'helper', refused, 1, 'Bills, helper');
  await page.context().close();
});
