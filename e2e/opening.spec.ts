import { test } from '@playwright/test';
import { expectOpeningLinesUp } from '@huishouden/pwa-kit/e2e';

// While Bills opens it shows the kit's opening frame (AppOpening): the same app bar, tabs and column
// as the loaded app, so nothing jumps when the first screen arrives (kit STANDARD.md "Updates").

test('the opening frame lines up with the loaded app: phone and tablet, light and dark', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  await expectOpeningLinesUp(browser, { baseURL, path: './?tab=history' });
});
