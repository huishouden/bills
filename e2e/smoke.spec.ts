import { expect, test } from '@playwright/test';
import {
  expectCleanLoad,
  expectCompactSampleBanner,
  expectGoogleSignInPopup,
  expectHuishoudenFrame,
  expectInstallable,
  expectSecurityHeaders,
} from '@huishouden/pwa-kit/e2e';

const fixedTime = '2031-05-14T10:30:00';

test('loads without runtime errors and shows the sample bills', async ({ page }) => {
  await page.clock.setFixedTime(fixedTime);
  await expectCleanLoad(page);
  await expect(page.getByText('Sample data')).toBeVisible();
  await expect(page.getByRole('heading', { name: '7 bills in the next 30 days; 1 overdue; 4 without autopay' })).toBeVisible();
  await expectHuishoudenFrame(page, { app: 'Bills', portalUrl: 'https://huishouden-piekstra.web.app' });
});

test('is installable', ({ page, request }) => expectInstallable(page, request));

test('Google sign-in popup reaches Google with an allowed redirect URI', ({ page, context }) =>
  expectGoogleSignInPopup(page, context, async (p) => {
    await p.getByRole('button', { name: 'Sign in with Google' }).first().click();
  }));

test('sends the security headers and leaves sign-in un-framed', ({ request }) => expectSecurityHeaders(request, '/', {}));

test('keeps the Sample data banner to one line on a phone', ({ page }) => expectCompactSampleBanner(page, '/'));
