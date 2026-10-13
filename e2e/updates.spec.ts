import { expect, test, type Page } from '@playwright/test';

// The screen lives in the address (kit STANDARD.md "Updates"): a reload, which a new version may
// need, and Back and Forward return to the same tab and open bill. The signed-out sample household.

const currentTab = (page: Page) => page.locator('nav[slot="nav"] button[aria-current="page"]');

test('a reload and Back return to the screen in the address', async ({ page }) => {
  await page.goto('./');
  await expect(currentTab(page)).toHaveText('Upcoming');
  await page.getByRole('button', { name: 'History', exact: true }).first().click();
  await expect(page).toHaveURL(/\?tab=history$/);
  await page.getByRole('button', { name: 'Sources', exact: true }).first().click();
  await expect(page).toHaveURL(/\?tab=sources$/);
  await page.reload();
  await expect(currentTab(page)).toHaveText('Sources');
  await page.goBack();
  await expect(currentTab(page)).toHaveText('History');
  await page.goForward();
  await expect(currentTab(page)).toHaveText('Sources');
});
