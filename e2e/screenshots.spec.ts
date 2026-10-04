import { expect, test } from '@playwright/test';
import { captureScreenshot } from '@huishouden/pwa-kit/e2e';

// README images of the signed-out app's invented sample household, refreshed by CI after each
// deploy. The clock is frozen at the sample's moment so every run renders the same.
const fixedTime = '2031-05-14T10:30:00';

test('upcoming', ({ page }) =>
  captureScreenshot(page, 'upcoming', {
    fixedTime,
    prepare: (p) => expect(p.getByRole('region', { name: 'Overdue' })).toBeVisible(),
  }));

test('possible regular bills', ({ page }) =>
  captureScreenshot(page, 'suggested-bills', {
    fixedTime,
    prepare: async (p) => {
      const card = p.getByRole('region', { name: 'Possible regular bills' });
      await card.scrollIntoViewIfNeeded();
      await expect(card.getByRole('listitem', { name: 'Netflix' })).toBeVisible();
    },
  }));

test('history', ({ page }) =>
  captureScreenshot(page, 'history', {
    fixedTime,
    prepare: async (p) => {
      await p.getByRole('button', { name: 'History', exact: true }).click();
      await expect(p.getByRole('list', { name: 'Past bills' })).toBeVisible();
    },
  }));

test('sources', ({ page }) =>
  captureScreenshot(page, 'sources', {
    fixedTime,
    prepare: async (p) => {
      await p.getByRole('button', { name: 'Sources', exact: true }).click();
      await expect(p.getByRole('list', { name: 'Bill sources' })).toBeVisible();
    },
  }));

test('find bills in my email', ({ page }) =>
  captureScreenshot(page, 'find-bills', {
    fixedTime,
    prepare: async (p) => {
      await p.getByRole('button', { name: 'Sources', exact: true }).click();
      await p.getByRole('button', { name: 'Find bills in my email' }).click();
      await expect(p.getByRole('list', { name: 'Found senders' })).toBeVisible();
    },
  }));

test('add a bill', ({ page }) =>
  captureScreenshot(page, 'add-bill', {
    fixedTime,
    prepare: async (p) => {
      await p.getByRole('button', { name: 'Add a bill' }).first().click();
      await expect(p.getByRole('dialog', { name: 'Add a bill' })).toBeVisible();
    },
  }));

test('phone: upcoming', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await captureScreenshot(page, 'phone-upcoming', {
    fixedTime,
    prepare: (p) => expect(p.getByRole('region', { name: 'Overdue' })).toBeVisible(),
  });
});

// Rent, paid by Zelle by hand, with its own reminders: the prompt to turn notifications on, the
// row that says who to pay, the bill opened from a notification, its reminders, and Settings.
test('phone: reminders prompt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await captureScreenshot(page, 'phone-reminders', {
    fixedTime,
    prepare: (p) => expect(p.getByRole('region', { name: 'Get bill reminders here' })).toBeVisible(),
  });
});

test('phone: rent, who to pay and how', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await captureScreenshot(page, 'phone-rent-row', {
    fixedTime,
    prepare: async (p) => {
      const rent = p.getByRole('listitem', { name: 'Rent' });
      await rent.scrollIntoViewIfNeeded();
      await p.evaluate(() => window.scrollBy(0, 220));
      await expect(rent).toContainText('Zelle to Example Rentals');
    },
  });
});

test('phone: a bill opened from its notification', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await captureScreenshot(page, 'phone-bill', {
    path: './?bill=manual-rent~2031-06-08',
    fixedTime,
    prepare: (p) => expect(p.getByRole('dialog', { name: 'Rent' }).getByRole('region', { name: 'Reminders' })).toBeVisible(),
  });
});

test("phone: a bill's payee, way to pay and reminders", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await captureScreenshot(page, 'phone-bill-reminders', {
    fixedTime,
    prepare: async (p) => {
      await p.getByRole('button', { name: 'Edit Rent' }).click();
      const dialog = p.getByRole('dialog', { name: 'Edit bill' });
      await dialog.getByRole('group', { name: 'When' }).scrollIntoViewIfNeeded();
      await expect(dialog.getByRole('group', { name: 'When' })).toBeVisible();
    },
  });
});

test("phone: how to pay, filled in from the payee", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await captureScreenshot(page, 'phone-pay-prefill', {
    fixedTime,
    prepare: async (p) => {
      await p.getByRole('button', { name: 'Add a bill' }).first().click();
      const dialog = p.getByRole('dialog', { name: 'Add a bill' });
      await dialog.getByLabel('Name').first().fill('Rent');
      await dialog.getByLabel('Pay to').selectOption({ label: 'Example Rentals (Landlord)' });
      await dialog.getByRole('group', { name: 'How to pay' }).getByRole('button', { name: 'Zelle' }).click();
      await expect(dialog.getByLabel('Zelle phone or email')).toHaveValue('rentals@example.com');
      await dialog.getByText('Paying it').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    },
  });
});

test('phone: Bills settings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await captureScreenshot(page, 'phone-settings', {
    fixedTime,
    prepare: async (p) => {
      await p.getByRole('button', { name: 'Settings' }).click();
      await p.getByRole('button', { name: 'Bills settings' }).click();
      await expect(p.getByRole('dialog', { name: 'Bills settings' }).getByRole('radio', { name: 'None' })).toBeChecked();
    },
  });
});

// What a helper or kid sees: no money, a way back to the portal.
test('helper', ({ page }) => captureScreenshot(page, 'helper', { path: './?sample=helper' }));
