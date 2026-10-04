import { describe, expect, test } from 'bun:test';
import { zonedTime } from '@huishouden/pwa-kit/ics';
import { DEMO_NOW, demoData } from './demo';
import { DEFAULT_BILL_SETTINGS, type Bill, type BillSettings } from './model';
import { billReminders, billUrl, remindPlan, reminderRef } from './reminders';

const data = demoData();
const NY: BillSettings = { ...DEFAULT_BILL_SETTINGS, timeZone: 'America/New_York' };
const ctx = (settings: BillSettings | null = NY, now = DEMO_NOW) => ({ sources: data.sources, contacts: data.contacts, settings, now });
const at9 = (day: string, zone = 'America/New_York') => zonedTime(day, '09:00', zone);
const rent = data.bills.find((b) => b.id === 'manual-rent~2031-06-08')!;
const power = data.bills.find((b) => b.id === 'power_2031-05-20')!;

describe('which bills remind', () => {
  test('by default none do: only rent, which has its own reminders on', () => {
    expect(new Set(billReminders(data.bills, ctx()).map((r) => r.ref))).toEqual(new Set([reminderRef(rent.id)]));
  });

  test('"paid by hand" covers autopay off; "all" adds unknown autopay; neither covers autopay', () => {
    const manual = { ...NY, remindDefault: 'manual' as const };
    const all = { ...NY, remindDefault: 'all' as const };
    expect(remindPlan(power, undefined, manual)).toEqual({ days: [3, 0], overdue: true });
    const unknown: Bill = { ...power, autopay: null };
    expect(remindPlan(unknown, undefined, manual)).toBeNull();
    expect(remindPlan(unknown, undefined, all)).toEqual({ days: [3, 0], overdue: true });
    const drafted: Bill = { ...power, autopay: { enrolled: true } };
    expect(remindPlan(drafted, undefined, all)).toBeNull();
  });

  test("a bill's own setting wins: off, or on with its days; autopay only when opted in, never overdue", () => {
    const all = { ...NY, remindDefault: 'all' as const };
    expect(remindPlan(power, { on: false }, all)).toBeNull();
    expect(remindPlan(power, { on: true, days: [1] }, NY)).toEqual({ days: [1], overdue: true });
    expect(remindPlan({ ...power, autopay: { enrolled: true } }, { on: true, days: [1], overdue: true }, NY)).toEqual({ days: [1], overdue: false });
  });
});

describe('billReminders', () => {
  const list = billReminders(data.bills, ctx());

  test('rent: 3 days before, on the day and the day after, at 9:00 household time', () => {
    expect(list.map((r) => r.at)).toEqual([at9('2031-06-05'), at9('2031-06-08'), at9('2031-06-09')]);
    expect(list.map((r) => r.title)).toEqual(['Rent is due in 3 days', 'Rent is due today', 'Rent is overdue']);
  });

  test('says how much and how to pay, opens the bill, and goes to everyone who sees money', () => {
    expect(list[0]).toMatchObject({
      app: 'bills',
      body: '$1,850.00 · Zelle to Example Rentals · rentals@example.com',
      url: billUrl(rent.id),
      recipients: 'all',
      private: true,
      ref: reminderRef(rent.id),
    });
    expect(list[0].url).toEndWith('/bills/?bill=manual-rent~2031-06-08');
  });

  test('only the member who pays it, when one is named', () => {
    const bills = data.bills.map((b) => (b.id === rent.id ? { ...b, payer: 'alex@example.com' } : b));
    expect(new Set(billReminders(bills, ctx()).map((r) => JSON.stringify(r.recipients)))).toEqual(new Set(['["alex@example.com"]']));
  });

  test('paid, skipped and removed bills have none, so writing the list again cancels theirs', () => {
    const paid = data.bills.map((b) => (b.id === rent.id ? { ...b, status: 'paid' as const } : b));
    expect(billReminders(paid, ctx())).toEqual([]);
    const skipped = data.bills.map((b) => (b.id === rent.id ? { ...b, dismissed: true } : b));
    expect(billReminders(skipped, ctx())).toEqual([]);
    expect(billReminders(data.bills.filter((b) => b.id !== rent.id), ctx())).toEqual([]);
  });

  test('past times are left out; the same day in another zone moves the hour', () => {
    const late = billReminders(data.bills, ctx(NY, at9('2031-06-08') + 60_000));
    expect(late.map((r) => r.title)).toEqual(['Rent is overdue']);
    const la = billReminders(data.bills, ctx({ ...NY, timeZone: 'America/Los_Angeles' }));
    expect(la[0].at - list[0].at).toBe(3 * 3_600_000);
  });

  test('stable ids: the same reminder is written to the same document', () => {
    expect(billReminders(data.bills, ctx()).map((r) => r.id)).toEqual(list.map((r) => r.id));
    expect(new Set(list.map((r) => r.id)).size).toBe(list.length);
  });

  test('an autopay bill opted in reminds before its draft date, as a draft', () => {
    const hulu = data.bills.find((b) => b.id === 'manual-hulu')!;
    const bills = [{ ...hulu, remind: { on: true, days: [1] } }];
    const r = billReminders(bills, ctx());
    expect(r.map((x) => [x.title, x.at])).toEqual([['Hulu drafts in 1 day', at9('2031-05-27')]]);
  });

  test('the household default reminds every bill paid by hand, from settings', () => {
    const r = billReminders(data.bills, ctx({ ...NY, remindDefault: 'manual', remindDays: [1], remindOverdue: false }));
    expect(new Set(r.map((x) => x.title))).toContain('Example Power Co is due in 1 day');
    expect(r.some((x) => x.title.startsWith('Hulu') || x.title.startsWith('Example Fiber'))).toBe(false);
  });
});
