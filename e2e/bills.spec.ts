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
  await expect(section(page, 'Later this month').getByRole('listitem')).toHaveCount(4);
});

test('mark paid moves a bill to history, and Undo brings it back', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Mark Example Power Co paid' }).click();
  await expect(page.getByText('Marked Example Power Co paid')).toBeVisible();
  await expect(section(page, 'This week').getByRole('listitem', { name: 'Example Power Co' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(section(page, 'This week').getByRole('listitem', { name: 'Example Power Co' })).toBeVisible();
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
  await page.getByRole('button', { name: 'Undo' }).click();
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
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(card.getByRole('listitem', { name: 'Netflix' })).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Netflix' })).toHaveCount(1);

  await card.getByRole('button', { name: 'Not a bill: Spotify' }).click();
  await expect(page.getByText("Spotify won't be suggested again")).toBeVisible();
  await expect(card.getByRole('listitem', { name: 'Spotify' })).toHaveCount(0);
  await expect(page.getByText('Subscriptions: $77.55/month across 4')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(card.getByRole('listitem', { name: 'Spotify' })).toBeVisible();
  await expect(page.getByText('Subscriptions: $89.54/month across 5')).toBeVisible();
});
