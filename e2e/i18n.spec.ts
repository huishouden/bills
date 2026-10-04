import { expect, test } from '@playwright/test';
import { expectLocalized, useLanguage } from '@huishouden/pwa-kit/e2e';
import es from '../src/locales/es.json' with { type: 'json' };
import nl from '../src/locales/nl.json' with { type: 'json' };

// The signed-out sample in Spanish and Dutch: the app's own chrome and the kit's, no English left.
// Bill names are sample data and stay as entered.
const fixedTime = '2031-05-14T10:30:00';
const ENGLISH = ['Bills', 'Upcoming', 'History', 'Sources', 'Autopay', 'This week', 'Later this month', 'Add a bill', 'Check email', 'Paid', 'Possible regular bills'];

for (const [lang, messages] of [
  ['es', es],
  ['nl', nl],
] as const) {
  test(`the sample in ${lang}`, async ({ page }) => {
    await page.clock.setFixedTime(fixedTime);
    await expectLocalized(page, lang, { words: ENGLISH });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages['app.name']);
    await expect(page.getByRole('region', { name: messages['upcoming.week'] })).toBeVisible();

    await page.getByRole('button', { name: messages['upcoming.addBill'] }).first().click();
    const dialog = page.getByRole('dialog', { name: messages['billDialog.titleAdd'] });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: messages['billDialog.once'] })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('group', { name: messages['form.autopay'] }).getByRole('button', { name: messages['form.on'], exact: true })).toBeVisible();
  });
}

test('an amount typed with a decimal comma is saved and shown the Dutch way', async ({ page }) => {
  await page.clock.setFixedTime(fixedTime);
  await useLanguage(page, 'nl');
  await page.goto('./', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: nl['upcoming.addBill'] }).first().click();
  const dialog = page.getByRole('dialog', { name: nl['billDialog.titleAdd'] });
  await dialog.getByPlaceholder(nl['billDialog.namePlaceholder']).fill('Example Gym');
  await dialog.getByLabel(nl['billDialog.amount']).fill('120,50');
  await dialog.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect(dialog).toBeHidden();
  const row = page.getByRole('listitem').filter({ hasText: 'Example Gym' });
  await expect(row).toContainText('120,50');
  await expect(row).not.toContainText('12.050');
});
