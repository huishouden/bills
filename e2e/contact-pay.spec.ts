import { expect, test } from '@playwright/test';
import { useTestHousehold } from '@huishouden/pwa-kit/e2e';

// A payee's pay details are money: kept in contactPay (admins and members only), never on the
// contact, which helpers and kids read. Signed in as the invented people of a household of this
// run's own, against the real rules (pwa-kit STANDARD.md "Staging").

// The landlord still has pay details on the contact itself, as Bills 1.12.0 saved them.
const hh = useTestHousehold(test, {
  docs: {
    'contacts/landlord': { name: 'Example Rentals', role: 'Landlord', phone: '(555) 010-0123', pay: { zelle: 'rentals@example.com' }, apps: ['home', 'bills'], private: false, createdAt: 1, by: 'admin@example.com' },
    'contacts/plumber': { name: 'Example Plumbing', role: 'Plumber', phone: '(555) 010-0188', apps: ['home'], private: false, createdAt: 1, by: 'admin@example.com' },
  },
});

test("an admin's Bills moves pay details off the contact, and a bill's Zelle is remembered in contactPay", { tag: '@smoke' }, async ({ browser }) => {
  const page = await hh.open(browser, 'admin');
  await expect(page.getByRole('button', { name: 'Add a bill' }).first()).toBeVisible({ timeout: 20_000 });

  // Moved on load: in contactPay, gone from the contact.
  await expect.poll(async () => (await hh.get('contactPay/landlord'))?.zelle, { timeout: 20_000 }).toBe('rentals@example.com');
  expect(Object.keys((await hh.get('contacts/landlord')) ?? {})).not.toContain('pay');

  await page.getByRole('button', { name: 'Add a bill' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add a bill' });
  await dialog.getByLabel('Name').first().fill('Drain repair');
  const how = dialog.getByRole('group', { name: 'How to pay' });
  await how.getByRole('button', { name: 'Zelle' }).click();
  // The landlord's moved Zelle still fills in.
  await dialog.getByLabel('Pay to').selectOption({ label: 'Example Rentals (Landlord)' });
  await expect(dialog.getByLabel('Zelle phone or email')).toHaveValue('rentals@example.com');
  await dialog.getByLabel('Pay to').selectOption({ label: 'Example Plumbing (Plumber)' });
  await expect(dialog.getByLabel('Zelle phone or email')).toHaveValue('(555) 010-0188');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('listitem', { name: 'Drain repair' })).toContainText('Zelle to Example Plumbing · (555) 010-0188');

  await expect.poll(async () => (await hh.get('contactPay/plumber'))?.zelle, { timeout: 20_000 }).toBe('(555) 010-0188');
  expect(Object.keys((await hh.get('contacts/plumber')) ?? {})).not.toContain('pay');
});

test('a helper is refused Bills: nothing loads, no pay details, no permission errors', async ({ browser }) => {
  const page = await hh.open(browser, 'helper', 'about:blank');
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const reads: string[] = [];
  page.on('request', (r) => {
    if (/contactPay|billSources|billSync|\/bills\b/.test(decodeURIComponent(r.url()).replace(/\/bills\/(?!.*documents)/, '/') + (r.postData() ?? ''))) reads.push(r.url());
  });
  await page.goto('./');
  await expect(page.getByText('Only admins and members can see the household’s money.')).toBeVisible({ timeout: 20_000 });
  expect(reads.filter((u) => /firestore|:8080/.test(u))).toEqual([]);
  await expect(page.getByText('rentals@example.com')).toHaveCount(0);
  expect(errors.filter((e) => /permission|insufficient/i.test(e))).toEqual([]);
});
