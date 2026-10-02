import { expect, test } from '@playwright/test';
import { signInTestUser } from '@huishouden/pwa-kit/e2e';

// Signed in as an invented test user on the staging site (pwa-kit STANDARD.md "Staging"): the real
// staging Firestore and rules, the seeded test household. Other runs share that household, so each
// test writes a value unique to its run and looks for exactly that.
test.skip(!process.env.HH_STAGING_SA, 'signed-in tests run against staging, in CI');

const today = () => new Date().toISOString().slice(0, 10);

test('a bill one member marks paid shows as paid for the other', async ({ page, browser }) => {
  await signInTestUser(page, { email: 'test-a@example.com' });
  // A manual bill unique to this run, so another run's bills never match.
  const label = `Test bill ${Date.now().toString(36)}`;
  await page.getByRole('button', { name: 'Add a bill' }).first().click({ timeout: 20_000 });
  const dialog = page.getByRole('dialog', { name: 'Add a bill' });
  await dialog.getByLabel('Name').fill(label);
  await dialog.getByLabel('Due date').fill(today());
  await dialog.getByLabel('Amount (optional)').fill('42');
  await dialog.getByRole('button', { name: 'Save' }).click();
  const row = page.getByRole('listitem', { name: label });
  await expect(row).toContainText('$42.00');
  await row.getByRole('button', { name: `Mark ${label} paid` }).click();
  await expect(page.getByText(`Marked ${label} paid`)).toBeVisible();

  // Saved in the household, not just on this screen: the other member's own browser shows it paid.
  const other = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    const theirs = await other.newPage();
    await signInTestUser(theirs, { email: 'test-b@example.com' });
    await theirs.getByRole('button', { name: 'History', exact: true }).click({ timeout: 20_000 });
    await expect(theirs.getByRole('listitem', { name: label })).toContainText('marked paid', { timeout: 20_000 });
  } finally {
    await other.close();
  }
});

// Roles: a helper (test-helper) is refused the household's bills and nothing loads.
test.describe('as a helper', () => {
  test.beforeAll(async () => {
    // Another app's run may have reseeded the household with an older kit that has no helper.
    const { seedTestHousehold } = await import('@huishouden/pwa-kit/staging');
    await seedTestHousehold({ accessToken: process.env.HH_STAGING_ACCESS_TOKEN! });
  });

  test('opening Bills says only admins and members can see the money, and loads none', async ({ page }) => {
    const reads: string[] = [];
    page.on('request', (r) => {
      if (/bills|billSources|billSync/.test(decodeURIComponent(r.url()).replace(/huishouden-staging-bills/g, '') + (r.postData() ?? ''))) reads.push(r.url());
    });
    await signInTestUser(page, { email: 'test-helper@example.com' });
    await expect(page.getByText('Only admins and members can see the household’s money.')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('link', { name: 'Open Huishouden' })).toBeVisible();
    expect(reads.filter((u) => u.includes('firestore'))).toEqual([]);
  });
});

// Possible regular bills: charges seeded into the household's card spending (as Huishouden Spending
// stores them) under a merchant unique to this run show up as a suggestion, and Add makes the bill.
test.describe('suggested bills from card spending', () => {
  const PROJECT = 'huishouden-staging';
  const docs = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/households/test-household`;
  // Letters only: digits in a merchant name read as a store number and are dropped.
  const tag = Date.now().toString(26).replace(/[0-9]/g, (d) => 'qrstuvwxyz'[Number(d)]);
  const merchant = `TESTSTREAM ${tag.toUpperCase()}`;
  const name = `Teststream ${tag.charAt(0).toUpperCase()}${tag.slice(1)}`;
  const key = `teststream-${tag}`;
  const ids = [0, 1, 2, 3].map((i) => `e2e-${tag}-${i}`);

  const admin = async (method: string, path: string, body?: object) => {
    const res = await fetch(`${docs}/${path}`, {
      method,
      headers: { authorization: `Bearer ${process.env.HH_STAGING_ACCESS_TOKEN}`, 'content-type': 'application/json', 'x-goog-user-project': PROJECT },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok && res.status !== 404) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  };
  const ymdMonthsAgo = (months: number) => {
    const d = new Date();
    d.setDate(d.getDate() - 5);
    d.setMonth(d.getMonth() - months);
    return d.toISOString().slice(0, 10);
  };

  test.beforeAll(async () => {
    for (const [i, id] of ids.entries()) {
      const str = (stringValue: string) => ({ stringValue });
      await admin('PATCH', `spendingTransactions/${id}`, {
        fields: {
          date: str(ymdMonthsAgo(3 - i)),
          description: str(merchant),
          amount: { doubleValue: 14.99 },
          category: str('Subscriptions & Tech'),
          card: str('Test Card'),
          type: str('Sale'),
          source: str('statement'),
          createdAt: { integerValue: String(Date.now()) },
          by: str('test-a@example.com'),
        },
      });
    }
  });

  test.afterAll(async () => {
    for (const id of ids) await admin('DELETE', `spendingTransactions/${id}`);
    await admin('DELETE', `billSuggestions/${key}`);
  });

  test('a regular card charge is suggested, and Add makes a repeating card bill', async ({ page }) => {
    await signInTestUser(page, { email: 'test-a@example.com' });
    const card = page.getByRole('region', { name: 'Possible regular bills' });
    const row = card.getByRole('listitem', { name });
    await expect(row).toContainText('Monthly, $14.99', { timeout: 20_000 });
    await row.getByRole('button', { name: `Add ${name}` }).click();
    await expect(page.getByText(`Added ${name}`)).toBeVisible();
    const bill = page.getByRole('listitem', { name }).filter({ hasText: 'Autopay by card' });
    await expect(bill).toContainText('$14.99');

    // Saved in the household: after a reload the bill is there and it is not suggested again.
    await page.reload();
    await expect(page.getByRole('listitem', { name }).filter({ hasText: 'Autopay by card' })).toBeVisible({ timeout: 20_000 });
    await expect(card.getByRole('listitem', { name })).toHaveCount(0);

    await page.getByRole('button', { name: `Remove ${name}` }).click();
    await expect(page.getByText(`Removed ${name}`)).toBeVisible();
  });
});
