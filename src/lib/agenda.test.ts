import { describe, expect, test } from 'bun:test';
import { allDayStart, agendaDoc } from '@huishouden/pwa-kit/agenda';
import { AGENDA_APP, APP_URL, agendaItems, billAgenda, billRef } from './agenda';
import { DEMO_NOW, demoData } from './demo';
import type { Bill } from './model';

const NOW = DEMO_NOW; // 2031-05-14
const base: Bill = {
  id: 'b',
  schema: 'bill/v1',
  source: 'manual',
  kind: 'electric',
  label: 'Example Power Co',
  due: '2031-05-20',
  amountDue: { amount: '84.20', currency: 'USD' },
  status: 'due',
  autopay: { enrolled: false },
  createdAt: 0,
  createdBy: 'sam@example.com',
  updatedAt: 0,
};
const bill = (patch: Partial<Bill>): Bill => ({ ...base, ...patch });

describe('agendaItems for the sample household', () => {
  const items = agendaItems(demoData().bills, NOW);

  test('publishes every open bill with a due date, and nothing from history', () => {
    expect(items.map((i) => `${i.title} ${i.status ?? 'autopay'}`).sort()).toEqual([
      'Example Commons HOA upcoming',
      'Example Fiber autopay',
      'Example Home Loans autopay',
      'Example Mutual upcoming',
      'Example Power Co upcoming',
      'Example Water District overdue',
      'Hulu autopay',
      'Rent upcoming',
    ]);
  });

  test('each item is an all-day bill on its due date, linking to the app', () => {
    const power = items.find((i) => i.ref === billRef('power_2031-05-20'))!;
    expect(power).toEqual({
      ref: 'bill:power_2031-05-20',
      kind: 'bill',
      title: 'Example Power Co',
      start: allDayStart('2031-05-20'),
      allDay: true,
      detail: '$120.00, autopay off',
      url: APP_URL,
      status: 'upcoming',
    });
  });

  test('every item is one the kit (and the rules) accept', () => {
    for (const i of items) expect(() => agendaDoc(AGENDA_APP, i, 'sam@example.com', NOW)).not.toThrow();
  });
});

describe('billAgenda', () => {
  test.each([
    [{}, 'upcoming', '$84.20, autopay off'],
    [{ due: '2031-05-10' }, 'overdue', '$84.20, autopay off'],
    [{ autopay: null }, 'upcoming', '$84.20, autopay unknown'],
    [{ amountDue: null }, 'upcoming', 'Autopay off'],
    [{ autopay: { enrolled: true } }, undefined, '$84.20, autopay on'],
  ])('%p → %p, %p', (patch, status, detail) => {
    const [item] = billAgenda(bill(patch as Partial<Bill>), [], NOW);
    expect(item.status).toBe(status as never);
    expect(item.detail).toBe(detail);
  });

  test.each([
    ['paid', { status: 'paid' as const }],
    ['credit', { status: 'credit' as const }],
    ['no due date', { due: null }],
    ['removed', { dismissed: true }],
    ['autopay past its due date (presumed drafted)', { due: '2031-05-10', autopay: { enrolled: true } }],
  ])('%s → nothing', (_name, patch) => expect(billAgenda(bill(patch), [], NOW)).toEqual([]));

  test('an older statement replaced by a newer one leaves the agenda', () => {
    const older = bill({ id: 'old', source: 'email', sourceId: 's', due: '2031-05-12' });
    const newer = bill({ id: 'new', source: 'email', sourceId: 's', due: '2031-06-12' });
    expect(billAgenda(older, [newer], NOW)).toEqual([]);
    expect(billAgenda(newer, [older], NOW)).toHaveLength(1);
  });

  test('reads the bill as given, not the stored copy it replaces', () => {
    const stored = bill({ status: 'paid' });
    expect(billAgenda(bill({ status: 'due' }), [stored], NOW)).toHaveLength(1);
    expect(billAgenda(bill({ status: 'paid' }), [bill({})], NOW)).toEqual([]);
  });

  test('uses the given app url', () => {
    expect(billAgenda(bill({}), [], NOW, 'https://example.com/')[0].url).toBe('https://example.com/');
  });
});

describe('privacy', () => {
  test('every item Bills publishes is stored private: helpers and kids never see the household’s bills', () => {
    const items = agendaItems(demoData().bills, NOW);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(agendaDoc(AGENDA_APP, item, 'sam@example.com', NOW).private).toBe(true);
  });
});

describe('Add to calendar on a bill row', () => {
  test('an open bill gives the same entry it publishes; a paid one none, and no bill carries edits', async () => {
    const { billCalendarEntry } = await import('./agenda');
    const { viewBills } = await import('./view');
    const { toYmd } = await import('@huishouden/pwa-kit/time');
    const views = viewBills(demoData().bills, toYmd(NOW));
    const published = agendaItems(demoData().bills, NOW);
    for (const v of views) {
      const entry = billCalendarEntry(v);
      const item = published.find((i) => i.ref === billRef(v.bill.id));
      if (item) expect({ ...entry, ref: item.ref }).toEqual(item);
      else expect(entry).toBeNull();
    }
    expect(published.every((i) => i.edit === undefined)).toBe(true);
  });

  test('a bill paid by hand says who to pay and how; autopay ones do not', () => {
    const data = demoData();
    const pay = { sources: data.sources, contacts: data.contacts };
    const items = agendaItems(data.bills, NOW, undefined, pay);
    expect(items.find((i) => i.title === 'Rent')!.detail).toBe('$1,850.00, autopay off, pay Example Rentals by Zelle');
    expect(items.find((i) => i.title === 'Hulu')!.detail).toBe('$17.99, autopay by card');
  });
});
