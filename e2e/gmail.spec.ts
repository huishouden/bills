import { expect, test } from '@playwright/test';
import { statementMessage } from './fixtures/gmail';

// Gmail has no emulator. These tests give the sample app a stand-in token (window.__gmailTestToken)
// so it calls the real Gmail REST paths, and answer those calls with page.route.

const fixedTime = '2031-05-14T10:30:00';

test('Check email searches each source, reads the newest statement and updates the bill', async ({ page }) => {
  const searches: string[] = [];
  const auth = new Set<string>();
  await page.route('https://gmail.googleapis.com/gmail/v1/users/me/messages**', async (route) => {
    const url = new URL(route.request().url());
    auth.add(route.request().headers().authorization ?? '');
    if (url.pathname.endsWith('/messages')) {
      const q = url.searchParams.get('q') ?? '';
      searches.push(q);
      return route.fulfill({ json: q.includes('power.example.com') ? { messages: [{ id: 'msg-power-0612', threadId: 't1' }] } : { resultSizeEstimate: 0 } });
    }
    if (url.pathname.endsWith('/msg-power-0612')) return route.fulfill({ json: statementMessage });
    return route.fulfill({ status: 404, json: { error: { message: 'not found' } } });
  });
  await page.addInitScript(() => {
    window.__gmailTestToken = 'test-token';
  });
  await page.clock.setFixedTime(fixedTime);
  await page.goto('./');

  const week = page.getByRole('region', { name: 'This week' });
  await expect(week.getByRole('listitem', { name: 'Example Power Co' })).toContainText('$120.00');
  await page.getByRole('button', { name: 'Check email' }).click();
  await expect(page.getByText('Checked just now; 1 bill updated')).toBeVisible();

  // The new statement replaces May's in the list: $135.00 due June 12, autopay now on.
  const later = page.getByRole('region', { name: 'Later this month' });
  const row = later.getByRole('listitem', { name: 'Example Power Co' });
  await expect(row).toContainText('$135.00');
  await expect(row).toContainText('Jun 12');
  await expect(row).toContainText('Autopay on');
  await expect(week.getByRole('listitem', { name: 'Example Power Co' })).toHaveCount(0);

  expect(searches).toContain('from:(billing@power.example.com) newer_than:60d');
  expect(searches).toContain('label:hoa newer_than:60d');
  expect([...auth]).toEqual(['Bearer test-token']);
});

test('an expired Gmail token is reported in words, with a retry', async ({ page }) => {
  await page.route('https://gmail.googleapis.com/**', (route) => route.fulfill({ status: 401, json: { error: { message: 'Invalid Credentials' } } }));
  await page.addInitScript(() => {
    window.__gmailTestToken = 'expired-token';
  });
  await page.clock.setFixedTime(fixedTime);
  await page.goto('./');
  await page.getByRole('button', { name: 'Check email' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Gmail access has ended; check email again to allow it.');
  await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible();
});
