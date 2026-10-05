import { describe, expect, test } from 'bun:test';
import { demoData } from './demo';
import { billState, headline, history, upcoming, viewBills } from './view';
import type { Bill } from './model';

const TODAY = '2031-05-14';
const base: Bill = {
  id: 'b',
  schema: 'bill/v1',
  source: 'manual',
  kind: 'other',
  label: 'Example',
  due: '2031-05-20',
  amountDue: { amount: '10.00', currency: 'USD' },
  status: 'due',
  autopay: null,
  createdAt: 0,
  createdBy: 'sam@example.com',
  updatedAt: 0,
};

describe('billState', () => {
  test.each([
    [{ due: '2031-05-12' }, 'overdue'],
    [{ due: '2031-05-14' }, 'attention'],
    [{ due: '2031-05-21' }, 'attention'],
    [{ due: '2031-05-22' }, 'upcoming'],
    [{ due: '2031-05-16', autopay: { enrolled: true } }, 'autopay'],
    [{ due: '2031-05-16', autopay: { enrolled: false } }, 'attention'],
    [{ due: '2031-05-10', autopay: { enrolled: true } }, 'autopaid'],
    [{ due: null }, 'no-date'],
    [{ status: 'paid' as const }, 'paid'],
    [{ status: 'credit' as const }, 'credit'],
  ])('%p → %p', (patch, want) => expect(billState({ ...base, ...patch } as Bill, TODAY)).toBe(want as never));

  test('an older statement is superseded by a newer one from the same source', () => {
    expect(billState({ ...base, source: 'email', sourceId: 's', due: '2031-04-20' }, TODAY, '2031-05-20')).toBe('superseded');
  });
});

describe('the sample household', () => {
  const views = viewBills(demoData().bills, TODAY);
  const u = upcoming(views);

  test('groups: overdue water, this week fiber and power, later the rest', () => {
    expect(u.overdue.map((v) => v.bill.label)).toEqual(['Example Water District']);
    expect(u.week.map((v) => v.bill.label)).toEqual(['Example Fiber', 'Example Power Co']);
    expect(u.later.map((v) => v.bill.label)).toEqual(['Hulu', 'Example Commons HOA', 'Example Home Loans', 'Rent', 'Example Mutual']);
  });

  test('headline counts bills, overdue and those without autopay', () => {
    const h = headline(u);
    expect(h.text).toBe('8 bills in the next 30 days; 1 overdue; 5 without autopay');
    expect(h.total).toEqual({ amount: '5057.99', currency: 'USD' });
  });

  test('history holds paid, presumed-drafted and skipped bills, newest first', () => {
    expect(history(views, TODAY).map((v) => `${v.bill.label} ${v.state}`)).toEqual([
      'Example Window Cleaning skipped',
      'Rent paid',
      'Example Home Loans autopaid',
      'Example Power Co paid',
      'Example Fiber autopaid',
      'Example Water District paid',
    ]);
  });

  test('a skipped bill leaves Upcoming and shows in history as skipped, even before its due date', () => {
    const bills = demoData().bills.map((b) => (b.id === 'power_2031-05-20' ? { ...b, dismissed: true } : b));
    const v = viewBills(bills, TODAY);
    expect(upcoming(v).week.map((x) => x.bill.label)).toEqual(['Example Fiber']);
    expect(history(v, TODAY).filter((x) => x.state === 'skipped').map((x) => x.bill.id)).toEqual(['power_2031-05-20', 'manual-window-cleaning']);
  });

  test('a bill marked paid here stays on Upcoming, done, for six hours; the headline leaves it out', () => {
    const at = new Date('2031-05-14T10:00:00').getTime();
    const bills = demoData().bills.map((b) => (b.id === 'power_2031-05-20' ? { ...b, status: 'paid' as const, paidAt: at, paidBy: 'me@example.com', paidVia: 'member' as const } : b));
    const v = viewBills(bills, TODAY);
    const soon = upcoming(v, undefined, at + 3_600_000);
    expect(soon.week.map((x) => x.bill.label)).toEqual(['Example Fiber']);
    expect(soon.paid.week.map((x) => x.bill.label)).toEqual(['Example Power Co']);
    expect(headline(soon).count).toBe(7);
    expect(upcoming(v, undefined, at + 6 * 3_600_000).paid.week).toEqual([]);
    expect(upcoming(v).paid.week).toEqual([]);
    const email = viewBills(bills.map((b) => (b.id === 'power_2031-05-20' ? { ...b, paidVia: 'email' as const } : b)), TODAY);
    expect(upcoming(email, undefined, at + 60_000).paid.week).toEqual([]);
  });

  test('a removed paid or drafted email bill stays hidden everywhere', () => {
    const removed = ['power_2031-04-20', 'fiber_2031-04-16'];
    const bills = demoData().bills.map((b) => (removed.includes(b.id) ? { ...b, dismissed: true } : b));
    expect(viewBills(bills, TODAY).some((x) => removed.includes(x.bill.id))).toBe(false);
  });
});
