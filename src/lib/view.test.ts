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
    expect(u.later.map((v) => v.bill.label)).toEqual(['Example Commons HOA', 'Example Home Loans', 'Example Mutual']);
  });

  test('headline counts bills, overdue and those without autopay', () => {
    const h = headline(u);
    expect(h.text).toBe('6 bills in the next 30 days; 1 overdue; 4 without autopay');
    expect(h.total).toEqual({ amount: '3190.00', currency: 'USD' });
  });

  test('history holds paid and presumed-drafted bills, newest first', () => {
    expect(history(views, TODAY).map((v) => `${v.bill.label} ${v.state}`)).toEqual([
      'Example Home Loans autopaid',
      'Example Power Co paid',
      'Example Fiber autopaid',
      'Example Water District paid',
    ]);
  });

  test('a removed email bill disappears everywhere', () => {
    const bills = demoData().bills.map((b) => (b.id === 'power_2031-05-20' ? { ...b, dismissed: true } : b));
    const v = viewBills(bills, TODAY);
    expect(upcoming(v).week.map((x) => x.bill.label)).toEqual(['Example Fiber']);
  });
});
