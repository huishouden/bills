import { expect, test, type Page } from '@playwright/test';

// The signed-out sample household, on its fixed 2031 day.
const fixedTime = '2031-05-14T10:30:00';

async function open(page: Page) {
  await page.clock.setFixedTime(fixedTime);
  await page.goto('./');
  await expect(page.getByText('Sample data')).toBeVisible();
}

const section = (page: Page, name: string) => page.getByRole('region', { name });

test('groups bills and calls out the ones autopay will not pay', async ({ page }) => {
  await open(page);
  const overdue = section(page, 'Overdue');
  await expect(overdue.getByRole('listitem', { name: 'Example Water District' })).toContainText('Overdue by 2 days');
  const week = section(page, 'This week');
  await expect(week.getByRole('listitem', { name: 'Example Power Co' })).toContainText('Autopay off');
  await expect(week.getByRole('listitem', { name: 'Example Fiber' })).toContainText('Autopay on');
  await expect(section(page, 'Later this month').getByRole('listitem')).toHaveCount(5);
});

test('a bill marked paid stays in its group as paid, with its own Undo; not paid and paid differ by role and name', async ({ page }) => {
  await open(page);
  const week = section(page, 'This week');
  const power = week.getByRole('listitem', { name: 'Example Power Co' });
  // Not paid: an outlined "Mark paid" named for the bill; no Undo, no aria-pressed.
  const mark = power.getByRole('button', { name: 'Mark Example Power Co paid' });
  await expect(mark).toHaveText('Mark paid');
  await expect(power.getByRole('button', { name: 'Undo paid for Example Power Co' })).toHaveCount(0);
  await expect(power.locator('[aria-pressed]')).toHaveCount(0);
  await mark.click();
  await expect(page.getByText('Marked Example Power Co paid')).toBeVisible();
  // Paid: no "Mark paid", who paid it and when, a small Undo; after the bills still to pay.
  await expect(power.getByRole('button', { name: 'Mark Example Power Co paid' })).toHaveCount(0);
  await expect(power).toContainText('Paid by you · 10:30 AM');
  await expect(power).toHaveAttribute('data-completion', 'done');
  await expect(week.getByRole('listitem').last()).toHaveAccessibleName('Example Power Co');
  await expect(power.locator('[aria-pressed]')).toHaveCount(0);
  // The toast's Undo puts it back as it was.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(power.getByRole('button', { name: 'Mark Example Power Co paid' })).toBeVisible();
  // Later, the row's own Undo does too.
  await power.getByRole('button', { name: 'Mark Example Power Co paid' }).click();
  await expect(page.getByText('Marked Example Power Co paid')).toBeHidden({ timeout: 10_000 });
  await power.getByRole('button', { name: 'Undo paid for Example Power Co' }).click();
  await expect(page.getByText('Example Power Co is unpaid again')).toBeVisible();
  await expect(power.getByRole('button', { name: 'Mark Example Power Co paid' })).toBeVisible();
});

test('a group whose bills are all paid folds to one line, which opens again', async ({ page }) => {
  await open(page);
  const overdue = section(page, 'Overdue');
  await overdue.getByRole('button', { name: 'Mark Example Water District paid' }).click();
  const fold = overdue.getByRole('button', { name: /All paid/ });
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await expect(overdue.getByRole('listitem')).toHaveCount(0);
  await fold.click();
  await expect(overdue.getByRole('listitem', { name: 'Example Water District' })).toContainText('Paid by you');
  await expect(overdue.getByRole('button', { name: 'Undo paid for Example Water District' })).toBeVisible();
});

test('a skipped bill shows in history as skipped, and can be put back', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Skip Example Power Co' }).click();
  await expect(page.getByText('Skipped Example Power Co')).toBeVisible();
  await expect(section(page, 'This week').getByRole('listitem', { name: 'Example Power Co' })).toHaveCount(0);
  await page.getByRole('button', { name: 'History', exact: true }).click();
  const past = page.getByRole('list', { name: 'Past bills' });
  await expect(past.getByRole('listitem', { name: 'Example Power Co' }).filter({ hasText: 'skipped' })).toBeVisible();
  await expect(past.getByRole('listitem', { name: 'Example Window Cleaning' })).toContainText('skipped');
  await page.getByRole('button', { name: 'Put Example Power Co back' }).click();
  await expect(page.getByText('Example Power Co is back on the list')).toBeVisible();
  await page.getByRole('button', { name: 'Upcoming', exact: true }).click();
  await expect(section(page, 'This week').getByRole('listitem', { name: 'Example Power Co' })).toBeVisible();
});

test('a repeating bill added by hand comes back after it is paid', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Add a bill' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add a bill' });
  await dialog.getByLabel('Name').fill('Lawn service');
  await dialog.getByLabel('Due date').fill('2031-05-12');
  await dialog.getByLabel('Amount (optional)').fill('45');
  await dialog.getByRole('group', { name: 'Repeats' }).getByRole('button', { name: 'Monthly' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  const row = section(page, 'Overdue').getByRole('listitem', { name: 'Lawn service' });
  await expect(row).toContainText('$45.00');
  await expect(row).toContainText('Autopay unknown');
  await row.getByRole('button', { name: 'Mark Lawn service paid' }).click();
  await expect(section(page, 'Later this month').getByRole('listitem', { name: 'Lawn service' })).toContainText('Jun 12');
});

test('Check email reads the sample mailbox: the overdue water bill was paid', async ({ page }) => {
  await open(page);
  await expect(section(page, 'Overdue')).toBeVisible();
  await page.getByRole('button', { name: 'Check email' }).click();
  await expect(page.getByText(/Checked just now; \d+ bills? updated/)).toBeVisible();
  await expect(section(page, 'Overdue')).toHaveCount(0);
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByRole('listitem', { name: 'Example Water District' }).first()).toContainText('payment email received');
});

test('Find bills in my email proposes new senders, and adding one makes a source', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  await page.getByRole('button', { name: 'Find bills in my email' }).click();
  const dialog = page.getByRole('dialog', { name: 'Find bills in my email' });
  const found = dialog.getByRole('list', { name: 'Found senders' });
  await expect(found).toContainText('billing@gas.example.com');
  await expect(found).toContainText('$40.00, due May 28');
  await expect(found).not.toContainText('power.example.com');
  await expect(dialog.getByLabel('Kind for billing@gas.example.com')).toHaveValue('gas');
  await dialog.getByLabel('Name for billing@gas.example.com').fill('Gas');
  await found.getByRole('listitem').filter({ hasText: 'billing@gas.example.com' }).getByRole('button', { name: 'Add' }).click();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('list', { name: 'Bill sources' })).toContainText('Gas');
  await page.getByRole('button', { name: 'Check email' }).click();
  await page.getByRole('button', { name: 'Upcoming', exact: true }).click();
  await expect(page.getByRole('listitem', { name: 'Gas' })).toContainText('$40.00');
});

test('a source is edited and deleted with Undo', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Example Commons HOA' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit bill source' });
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Deleted Example Commons HOA and its unpaid bills')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Bill sources' })).not.toContainText('Example Commons HOA');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Bill sources' })).toContainText('Example Commons HOA');
});

test('possible regular bills from card spending: Add and Not a bill, each with Undo', async ({ page }) => {
  await open(page);
  const card = page.getByRole('region', { name: 'Possible regular bills' });
  for (const name of ['Planet Fitness', 'Netflix', 'Spotify', 'Amazon Prime']) await expect(card.getByRole('listitem', { name })).toBeVisible();
  // Hulu is a bill already; the fiber charge is the Example Fiber source's bill.
  await expect(card).not.toContainText('Hulu');
  await expect(card).not.toContainText('Fiber');
  await expect(card.getByRole('listitem', { name: 'Netflix' })).toContainText('Monthly, $22.99 · next Jun 9 · 12 charges');
  await expect(page.getByText('Subscriptions: $89.54/month across 5')).toBeVisible();

  await card.getByRole('button', { name: 'Add Netflix' }).click();
  await expect(page.getByText('Added Netflix')).toBeVisible();
  await expect(card.getByRole('listitem', { name: 'Netflix' })).toHaveCount(0);
  const bill = section(page, 'Later this month').getByRole('listitem', { name: 'Netflix' });
  await expect(bill).toContainText('$22.99');
  await expect(bill).toContainText('Autopay by card');
  await expect(bill).toContainText('repeats monthly');
  await expect(page.getByText('Subscriptions: $89.54/month across 5')).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(card.getByRole('listitem', { name: 'Netflix' })).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Netflix' })).toHaveCount(1);

  await card.getByRole('button', { name: 'Not a bill: Spotify' }).click();
  await expect(page.getByText("Spotify won't be suggested again")).toBeVisible();
  await expect(card.getByRole('listitem', { name: 'Spotify' })).toHaveCount(0);
  await expect(page.getByText('Subscriptions: $77.55/month across 4')).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(card.getByRole('listitem', { name: 'Spotify' })).toBeVisible();
  await expect(page.getByText('Subscriptions: $89.54/month across 5')).toBeVisible();
});

test('rent says who to pay and how, copies the Zelle email, and opens its details', async ({ page }) => {
  await open(page);
  const rent = section(page, 'Later this month').getByRole('listitem', { name: 'Rent' });
  await expect(rent).toContainText('Zelle to Example Rentals · rentals@example.com');
  await expect(rent.getByLabel('Reminders on')).toBeVisible();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await rent.getByRole('button', { name: 'Copy the Zelle details' }).click();
  await expect(rent.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('rentals@example.com');

  await rent.getByRole('button', { name: 'Open Rent' }).click();
  const detail = page.getByRole('dialog', { name: 'Rent' });
  await expect(detail.getByRole('region', { name: 'How to pay' })).toContainText('Zelle to Example Rentals');
  await expect(detail.getByRole('link', { name: '(555) 010-0123' })).toHaveAttribute('href', /^tel:/);
  await expect(detail.getByRole('region', { name: 'Reminders' })).toContainText('3 days before, on the due day, and the day after if unpaid, at 9:00');
  await detail.getByRole('button', { name: 'Mark Rent paid' }).click();
  await expect(page.getByText('Marked Rent paid')).toBeVisible();
  // The next month's rent is added, still paid to the landlord by Zelle.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(rent).toBeVisible();
});

test("a notification's link opens the bill", async ({ page }) => {
  await page.clock.setFixedTime(fixedTime);
  await page.goto('./?bill=manual-rent~2031-06-08');
  const detail = page.getByRole('dialog', { name: 'Rent' });
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Mark Rent paid' })).toBeVisible();
  await expect(page).toHaveURL(/\/bills\/$/);
});

test("reminders are off unless turned on: a bill's own, and the household default in Settings", async ({ page }) => {
  await open(page);
  const power = section(page, 'This week').getByRole('listitem', { name: 'Example Power Co' });
  await expect(power.getByLabel('Reminders on')).toHaveCount(0);

  // Rent's own reminders off: no bell, no prompt to turn notifications on.
  await page.getByRole('button', { name: 'Edit Rent' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit bill' });
  await dialog.getByRole('group', { name: 'Reminders' }).getByRole('button', { name: 'Off', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(section(page, 'Later this month').getByRole('listitem', { name: 'Rent' }).getByLabel('Reminders on')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Get bill reminders here' })).toHaveCount(0);

  // The household reminds every bill paid by hand: Power Co (autopay off) now does; Fiber (autopay) doesn't.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Bills settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Bills settings' });
  await expect(settings.getByRole('region', { name: 'Notifications on this device' })).toBeVisible();
  await expect(settings.getByRole('checkbox', { name: 'Mute bill reminders for me' })).toBeVisible();
  await expect(settings.getByRole('radio', { name: 'None' })).toBeChecked();
  await settings.getByRole('radio', { name: 'Unpaid bills we pay by hand' }).check();
  await settings.getByRole('button', { name: '1 day before' }).click();
  await settings.getByRole('button', { name: 'Save' }).click();
  await expect(power.getByLabel('Reminders on')).toBeVisible();
  await expect(section(page, 'This week').getByRole('listitem', { name: 'Example Fiber' }).getByLabel('Reminders on')).toHaveCount(0);
  await expect(section(page, 'Later this month').getByRole('listitem', { name: 'Rent' }).getByLabel('Reminders on')).toHaveCount(0);
  await power.getByRole('button', { name: 'Open Example Power Co' }).click();
  await expect(page.getByRole('dialog', { name: 'Example Power Co' }).getByRole('region', { name: 'Reminders' })).toContainText('3 days before, 1 day before, on the due day, and the day after if unpaid');
});

test('a new contact from the bill dialog becomes who it is paid to', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Add a bill' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add a bill' });
  await dialog.getByLabel('Name').first().fill('Lawn care');
  await dialog.getByRole('button', { name: 'New contact' }).click();
  const contact = page.getByRole('dialog', { name: 'New contact' });
  await contact.getByLabel('Name', { exact: true }).fill('Example Lawns');
  await contact.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByLabel('Pay to')).toHaveValue(/.+/);
  await dialog.getByRole('group', { name: 'How to pay' }).getByRole('button', { name: 'Venmo' }).click();
  await dialog.getByLabel('Venmo @handle').fill('example-lawns');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('listitem', { name: 'Lawn care' })).toContainText('Venmo to Example Lawns · @example-lawns');
});

test.describe('on a phone: filling in how to pay from the payee', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the payee's phone fills in Zelle, a new payee replaces it, typed text stays, and the next bill remembers", async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Add a bill' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Add a bill' });
    await dialog.getByLabel('Name').first().fill('Drain repair');
    const how = dialog.getByRole('group', { name: 'How to pay' });

    // Method first, then the payee: their only phone fills in, to be remembered on them.
    await how.getByRole('button', { name: 'Zelle' }).click();
    await dialog.getByLabel('Pay to').selectOption({ label: 'Example Plumbing (Plumber)' });
    const details = dialog.getByLabel('Zelle phone or email');
    await expect(details).toHaveValue('(555) 010-0188');
    await expect(dialog.getByText('Saved on Example Plumbing when you save, for their next bill.')).toBeVisible();

    // Another payee replaces what was filled in: the landlord's saved Zelle email, their phone one tap away.
    await dialog.getByLabel('Pay to').selectOption({ label: 'Example Rentals (Landlord)' });
    await expect(details).toHaveValue('rentals@example.com');
    await expect(dialog.getByText('Saved on Example Rentals.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Use (555) 010-0123' }).click();
    await expect(details).toHaveValue('(555) 010-0123');

    // Typed text is never replaced.
    await details.fill('plumbing@example.com');
    await dialog.getByLabel('Pay to').selectOption({ label: 'Example Plumbing (Plumber)' });
    await expect(details).toHaveValue('plumbing@example.com');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('listitem', { name: 'Drain repair' })).toContainText('Zelle to Example Plumbing · plumbing@example.com');

    // The next bill to them, payee first: filled in from what was saved.
    await page.getByRole('button', { name: 'Add a bill' }).first().click();
    await dialog.getByLabel('Name').first().fill('Water heater');
    await dialog.getByLabel('Pay to').selectOption({ label: 'Example Plumbing (Plumber)' });
    await how.getByRole('button', { name: 'Zelle' }).click();
    await expect(dialog.getByLabel('Zelle phone or email')).toHaveValue('plumbing@example.com');
    await expect(dialog.getByText('Saved on Example Plumbing.')).toBeVisible();
  });

  test('an online portal is a link, with Open in the row; a new contact keeps how to pay them', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Add a bill' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Add a bill' });
    await dialog.getByLabel('Name').first().fill('Parking permit');
    await dialog.getByRole('button', { name: 'New contact' }).click();
    const contact = page.getByRole('dialog', { name: 'New contact' });
    await contact.getByLabel('Name', { exact: true }).fill('Example City');
    await expect(contact.getByText('How to pay them')).toBeVisible();
    await contact.getByLabel('Online portal').fill('pay.example.com/parking');
    await contact.getByRole('button', { name: 'Save' }).click();
    await dialog.getByRole('group', { name: 'How to pay' }).getByRole('button', { name: 'Online portal' }).click();
    await expect(dialog.getByLabel('Portal link')).toHaveValue('https://pay.example.com/parking');
    await expect(dialog.getByText('Saved on Example City.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Save' }).click();
    const row = page.getByRole('listitem', { name: 'Parking permit' });
    await expect(row).toContainText('Online portal to Example City');
    await expect(row.getByRole('link', { name: 'Pay Parking permit on its site' })).toHaveAttribute('href', 'https://pay.example.com/parking');
    await expect(row.getByRole('link', { name: 'Pay Parking permit on its site' })).toContainText('Open');
  });
});
