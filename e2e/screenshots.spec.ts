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

// What a helper or kid sees: no money, a way back to the portal.
test('helper', ({ page }) => captureScreenshot(page, 'helper', { path: '/?sample=helper' }));
