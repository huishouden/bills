import { describe, expect, test } from 'bun:test';
import type { RecurringCandidate } from '@huishouden/pwa-kit/recurring';
import { demoData } from './demo';
import { alreadyKept, kindFor, suggestionBill, suggestionId, suggestions, toCharge } from './suggestions';
import type { Bill, BillSource } from './model';
import { manualBillDoc } from './model';

const TODAY = '2031-05-14';

const candidate = (over: Partial<RecurringCandidate>): RecurringCandidate => ({
  merchantKey: 'netflix',
  displayName: 'Netflix',
  cadence: 'monthly',
  typicalAmount: 22.99,
  amountVaries: false,
  lastDate: '2031-05-09',
  nextExpected: '2031-06-09',
  occurrences: 12,
  confidence: 1,
  subscription: true,
  known: 'subscription',
  category: 'Subscriptions & Tech',
  monthlyAmount: 22.99,
  ...over,
});

const bill = (label: string, amount: string | null): Bill => ({ id: label, ...manualBillDoc({ label, kind: 'other', due: TODAY, amount, autopay: null, repeat: 'monthly' }, 'sam@example.com', 0, 0) });
const source = (name: string, from?: string): BillSource => ({ id: name, name, kind: 'internet', from, autopay: null, createdAt: 0, createdBy: 'sam@example.com', updatedAt: 0 });

describe('the sample household', () => {
  const d = demoData();
  const s = suggestions(d.charges, TODAY, d.bills, d.sources, d.answers);

  test('offers its subscriptions, not the one already a bill nor the internet bill it has a source for', () => {
    expect(s.fresh.map((c) => c.displayName)).toEqual(['Planet Fitness', 'Netflix', 'Spotify', 'Amazon Prime']);
    expect(s.all.map((c) => c.displayName)).toContain('Hulu');
    expect(s.all.map((c) => c.displayName)).toContain('Example Fiber Web');
  });

  test('counts every subscription a month, the added one too', () => {
    expect(s.subscriptions).toEqual({ count: 5, monthly: 89.54 });
  });

  test('"Not a bill" hides one and leaves it out of the subscriptions', () => {
    const answers = [...d.answers, { id: 'netflix', status: 'dismissed' as const, name: 'Netflix', by: 'sam@example.com', at: 0 }];
    const after = suggestions(d.charges, TODAY, d.bills, d.sources, answers);
    expect(after.fresh.map((c) => c.displayName)).not.toContain('Netflix');
    expect(after.subscriptions).toEqual({ count: 4, monthly: 66.55 });
  });

  test('at most five at once', () => {
    const many = Array.from({ length: 7 }, (_, i) => [0, 1, 2, 3].map((m) => ({ date: `2031-0${m + 2}-0${i + 1}`, description: `EXAMPLE SERVICE ${'ABCDEFG'[i]}`, amount: 5 + i, category: 'Subscriptions' })))
      .flat();
    expect(suggestions(many, TODAY, [], [], []).fresh).toHaveLength(5);
  });
});

describe('alreadyKept', () => {
  test.each([
    ['a bill with the same name and amount', [bill('Netflix', '22.99')], [], true],
    ['a bill with the same name and no amount', [bill('NETFLIX.COM', null)], [], true],
    ['a bill with the same name at another price', [bill('Netflix', '9.99')], [], false],
    ['a differently named bill at the same price', [bill('Hulu', '22.99')], [], false],
    ['a source with the same name', [], [source('Netflix')], true],
    ['a source by sender domain', [], [source('Streaming', 'info@netflix.com')], true],
    ['an unrelated source', [], [source('Example Fiber', 'fiber.example.com')], false],
  ] as [string, Bill[], BillSource[], boolean][])('%s', (_, bills, sources, kept) => expect(alreadyKept(candidate({}), bills, sources)).toBe(kept));

  test('an amount that varies matches by name alone', () => {
    expect(alreadyKept(candidate({ displayName: 'Example City Utilities', merchantKey: 'example city utilities', amountVaries: true, typicalAmount: 118.75 }), [bill('Example City Utilities', '80.00')], [])).toBe(true);
  });
});

describe('the bill Add creates', () => {
  test('repeats on the charge’s schedule, due when the next charge is expected, on card autopay', () => {
    expect(suggestionBill(candidate({}), [])).toEqual({ label: 'Netflix', kind: 'other', due: '2031-06-09', amount: '22.99', autopay: true, autopayVia: 'card', repeat: 'monthly' });
    const doc = manualBillDoc(suggestionBill(candidate({ cadence: 'weekly' }), []), 'sam@example.com', 1, 1);
    expect(doc).toMatchObject({ repeat: 'weekly', autopay: { enrolled: true, via: 'card' }, amountDue: { amount: '22.99', currency: 'USD' } });
  });

  test('two regular charges from one merchant are told apart by amount', () => {
    const small = candidate({ merchantKey: 'apple#2', displayName: 'Apple', typicalAmount: 2.99 });
    const big = candidate({ merchantKey: 'apple#10', displayName: 'Apple', typicalAmount: 10.99 });
    expect(suggestionBill(small, [small, big]).label).toBe('Apple $2.99');
    expect(suggestionId(small.merchantKey)).toBe('apple_2');
    expect(suggestionId('planet fitness')).toBe('planet-fitness');
  });

  test.each([
    [{ subscription: true, displayName: 'Xfinity' }, 'other'],
    [{ subscription: false, displayName: 'GEICO', merchantKey: 'geico' }, 'insurance'],
    [{ subscription: false, displayName: 'Verizon', merchantKey: 'verizon' }, 'phone'],
    [{ subscription: false, displayName: 'Xfinity', merchantKey: 'comcast' }, 'internet'],
    [{ subscription: false, displayName: 'Example Power', merchantKey: 'example power' }, 'electric'],
    [{ subscription: false, displayName: 'Example Lawn', merchantKey: 'example lawn' }, 'other'],
  ] as [Partial<RecurringCandidate>, string][])('kind of %p', (over, kind) => expect(kindFor(candidate(over))).toBe(kind as never));
});

test('reads Spending’s transaction documents', () => {
  expect(toCharge({ date: '2031-05-09', description: 'NETFLIX.COM', amount: 22.99, category: 'Subscriptions & Tech', type: 'Sale', card: 'Example Visa' })).toEqual({
    date: '2031-05-09',
    description: 'NETFLIX.COM',
    amount: 22.99,
    category: 'Subscriptions & Tech',
    type: 'Sale',
  });
  expect(toCharge({ date: '2031-05-09', description: 'X', amount: '12.50' })?.amount).toBe(12.5);
  expect(toCharge({ date: '2031-05-09', amount: 1 })).toBeNull();
  expect(toCharge({ date: '2031-05-09', description: 'X', amount: 'n/a' })).toBeNull();
});
