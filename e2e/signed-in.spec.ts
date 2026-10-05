import { expect, test, type Page } from '@playwright/test';
import { runPortalTodo, useTestHousehold } from '@huishouden/pwa-kit/e2e';

// Signed in as the invented people of a household of this run's own (pwa-kit STANDARD.md
// "Staging"), against the real rules: on the emulators (app-tests, `bun run e2e:emulator`), and on
// staging for what needs the suite's site (@staging) or a kit bump (@smoke).

// Possible regular bills: charges in the household's card spending (as Huishouden Spending stores
// them), seeded with the household. Letters only: digits in a merchant name read as a store number.
const MERCHANT = 'TESTSTREAM MEDIA';
const SUGGESTED = 'Teststream Media';
const ymdMonthsAgo = (months: number) => {
  const d = new Date();
  d.setDate(d.getDate() - 5);
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
};
const charges = Object.fromEntries(
  [0, 1, 2, 3].map((i) => [
    `spendingTransactions/e2e-${i}`,
    {
      date: ymdMonthsAgo(3 - i),
      description: MERCHANT,
      amount: 14.99,
      category: 'Subscriptions & Tech',
      card: 'Test Card',
      type: 'Sale',
      source: 'statement',
      createdAt: Date.now(),
      by: 'spending@example.com',
    },
  ]),
);

const hh = useTestHousehold(test, { docs: charges });

const today = () => new Date().toISOString().slice(0, 10);

/** Adds a manual bill due today for $42 on Upcoming, and returns its row. */
async function addBill(page: Page, label: string) {
  await page.getByRole('button', { name: 'Add a bill' }).first().click({ timeout: 20_000 });
  const dialog = page.getByRole('dialog', { name: 'Add a bill' });
  await dialog.getByLabel('Name').fill(label);
  await dialog.getByLabel('Due date').fill(today());
  await dialog.getByLabel('Amount (optional)').fill('42');
  await dialog.getByRole('button', { name: 'Save' }).click();
  const row = page.getByRole('listitem', { name: label });
  await expect(row).toContainText('$42.00');
  return row;
}

test('a bill one member marks paid shows as paid for the other', { tag: '@smoke' }, async ({ browser }) => {
  const label = 'Test bill';
  const page = await hh.open(browser, 'admin');
  const row = await addBill(page, label);
  await row.getByRole('button', { name: `Mark ${label} paid` }).click();
  await expect(page.getByText(`Marked ${label} paid`)).toBeVisible();

  // Saved in the household, not just on this screen: the other member's own browser shows it paid.
  const theirs = await hh.open(browser, 'member');
  await theirs.getByRole('button', { name: 'History', exact: true }).click({ timeout: 20_000 });
  await expect(theirs.getByRole('listitem', { name: label })).toContainText('marked paid', { timeout: 20_000 });
});

// @staging: the portal's To-do list is another app on the suite's site. A bill to pay is published
// there, and "Mark paid" there marks it paid in Bills.
test('a bill marked paid on the To-do tab shows paid in Bills', { tag: '@staging' }, async ({ browser }) => {
  test.setTimeout(120_000);
  const label = 'Todo bill';
  const page = await hh.open(browser, 'admin');
  await addBill(page, label);

  // Bills stays open (it publishes a few seconds after the change) while the portal, in another tab
  // signed in as the same member, marks it paid from the To-do list.
  const portal = await hh.open(browser, 'admin', 'about:blank');
  await runPortalTodo(portal, label, { action: 'done' });

  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByRole('listitem', { name: label })).toContainText('marked paid', { timeout: 20_000 });
});

// Roles: a helper is refused the household's bills and nothing loads.
test('as a helper, opening Bills says only admins and members can see the money, and loads none', async ({ page }) => {
  const reads: string[] = [];
  page.on('request', (r) => {
    if (/bills|billSources|billSync/.test(decodeURIComponent(r.url()).replace(/huishouden-staging-bills/g, '') + (r.postData() ?? ''))) reads.push(r.url());
  });
  await hh.signIn(page, 'helper');
  await expect(page.getByText('Only admins and members can see the household’s money.')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('link', { name: 'Open Huishouden' })).toBeVisible();
  expect(reads.filter((u) => u.includes('firestore'))).toEqual([]);
});

test('a regular card charge is suggested, and Add makes a repeating card bill', async ({ browser }) => {
  const page = await hh.open(browser, 'admin');
  const card = page.getByRole('region', { name: 'Possible regular bills' });
  const row = card.getByRole('listitem', { name: SUGGESTED });
  await expect(row).toContainText('Monthly, $14.99', { timeout: 20_000 });
  await row.getByRole('button', { name: `Add ${SUGGESTED}` }).click();
  await expect(page.getByText(`Added ${SUGGESTED}`)).toBeVisible();
  const bill = page.getByRole('listitem', { name: SUGGESTED }).filter({ hasText: 'Autopay by card' });
  await expect(bill).toContainText('$14.99');

  // Saved in the household: after a reload the bill is there and it is not suggested again.
  await page.reload();
  await expect(page.getByRole('listitem', { name: SUGGESTED }).filter({ hasText: 'Autopay by card' })).toBeVisible({ timeout: 20_000 });
  await expect(card.getByRole('listitem', { name: SUGGESTED })).toHaveCount(0);
});
