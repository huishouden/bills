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
