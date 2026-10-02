import { describe, expect, test } from 'bun:test';
import { billsFromMessages, discoverSources, planBillWrites, syncFromMailbox, type ParsedMessage } from './emailSync';
import { DEMO_NOW, DEMO_SOURCES, demoData } from './demo';
import { sampleMailbox } from './sampleMailbox';
import type { Bill, BillSource } from './model';
import type { ParsedBillEmail } from './billEmail';

const SAM = 'sam@example.com';
const power: BillSource = DEMO_SOURCES.find((s) => s.id === 'power')!;
const day = (ymd: string, h = 9) => new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)), h).getTime();
const usd = (amount: string) => ({ amount, currency: 'USD' });

const statement = (id: string, date: string, due: string | null, amount: string | null, extra: Partial<ParsedBillEmail> = {}): ParsedMessage => ({
  id,
  date: day(date),
  parsed: { kind: 'statement', due, amountDue: amount ? usd(amount) : null, autopay: null, period: null, paid: null, ...extra },
});
const payment = (id: string, date: string): ParsedMessage => ({
  id,
  date: day(date),
  parsed: { kind: 'payment', due: null, amountDue: null, autopay: null, period: null, paid: usd('120.00') },
});

describe('billsFromMessages', () => {
  test('one statement is one bill keyed by source and due date', () => {
    const [b] = billsFromMessages(power, [statement('m1', '2031-05-02', '2031-05-20', '120.00')]);
    expect(b.id).toBe('power_2031-05-20');
    expect(b.doc).toMatchObject({ schema: 'bill/v1', source: 'email', sourceId: 'power', kind: 'electric', label: 'Example Power Co', status: 'due', emailId: 'm1' });
  });

  test('a payment after the statement marks it paid; one before does not', () => {
    const paid = billsFromMessages(power, [statement('m1', '2031-05-02', '2031-05-20', '120.00'), payment('p1', '2031-05-18')]);
    expect(paid[0].doc).toMatchObject({ status: 'paid', paidVia: 'email', paidAt: day('2031-05-18') });
    const early = billsFromMessages(power, [payment('p0', '2031-04-30'), statement('m1', '2031-05-02', '2031-05-20', '120.00')]);
    expect(early[0].doc.status).toBe('due');
  });

  test('a payment belongs to the statement before it, not an older one', () => {
    const bills = billsFromMessages(power, [
      statement('m1', '2031-04-02', '2031-04-20', '110.00'),
      statement('m2', '2031-05-02', '2031-05-20', '120.00'),
      payment('p2', '2031-05-18'),
    ]);
    expect(bills.find((b) => b.id === 'power_2031-04-20')!.doc.status).toBe('due');
    expect(bills.find((b) => b.id === 'power_2031-05-20')!.doc.status).toBe('paid');
  });

  test('a reminder for the same due date merges into one bill', () => {
    const bills = billsFromMessages(power, [statement('m1', '2031-05-02', '2031-05-20', '120.00'), statement('m2', '2031-05-17', '2031-05-20', null)]);
    expect(bills).toHaveLength(1);
    expect(bills[0].doc.amountDue).toEqual(usd('120.00'));
    expect(bills[0].doc.emailId).toBe('m2');
  });

  test('the source decides autopay when the email is silent; the email wins when it speaks', () => {
    const src = { ...power, autopay: true };
    expect(billsFromMessages(src, [statement('m1', '2031-05-02', '2031-05-20', '120.00')])[0].doc.autopay).toEqual({ enrolled: true });
    const said = billsFromMessages(src, [statement('m1', '2031-05-02', '2031-05-20', '120.00', { autopay: { enrolled: false } })]);
    expect(said[0].doc.autopay).toEqual({ enrolled: false });
  });

  test('zero is paid, negative is a credit', () => {
    expect(billsFromMessages(power, [statement('m1', '2031-05-02', '2031-05-20', '0.00')])[0].doc.status).toBe('paid');
    expect(billsFromMessages(power, [statement('m1', '2031-05-02', '2031-05-20', '-5.00')])[0].doc.status).toBe('credit');
  });

  test('no due date: keyed by the day it arrived', () => {
    expect(billsFromMessages(power, [statement('m1', '2031-05-02', null, '120.00')])[0].id).toBe('power_2031-05-02');
  });
});

describe('planBillWrites', () => {
  const found = billsFromMessages(power, [statement('m1', '2031-05-02', '2031-05-20', '120.00')]);
  const now = DEMO_NOW;

  test('new bills are written with who and when', () => {
    const [w] = planBillWrites(found, new Map(), SAM, now);
    expect(w.data).toMatchObject({ createdAt: now, createdBy: SAM, updatedAt: now, observedAt: now });
  });

  test('the same content again writes nothing', () => {
    const [w] = planBillWrites(found, new Map(), SAM, now);
    const existing = new Map<string, Bill>([[w.id, { id: w.id, ...w.data }]]);
    expect(planBillWrites(found, existing, 'alex@example.com', now + 1000)).toEqual([]);
  });

  test("a member's Mark paid and Remove survive a later check", () => {
    const [w] = planBillWrites(found, new Map(), SAM, now);
    const old: Bill = { id: w.id, ...w.data, status: 'paid', paidAt: now, paidBy: SAM, paidVia: 'member', dismissed: true };
    const changed = billsFromMessages(power, [statement('m9', '2031-05-03', '2031-05-20', '125.00')]);
    const [again] = planBillWrites(changed, new Map([[w.id, old]]), SAM, now + 1000);
    expect(again.data).toMatchObject({ status: 'paid', paidBy: SAM, paidVia: 'member', dismissed: true, createdAt: now });
    expect(again.data.amountDue).toEqual(usd('125.00'));
  });
});

describe('syncFromMailbox with the sample mailbox', () => {
  test('reads each source, marks the paid water bill, and reports counts', async () => {
    const data = demoData();
    const result = await syncFromMailbox(sampleMailbox(() => DEMO_NOW), data.sources, data.bills, SAM, DEMO_NOW);
    const water = result.writes.find((w) => w.id === 'water_2031-05-12');
    expect(water?.data).toMatchObject({ status: 'paid', paidVia: 'email' });
    expect(result.status).toMatchObject({ by: SAM, sources: 5, errors: [] });
    expect(result.status.emails).toBeGreaterThanOrEqual(4);
  });

  test('a failing source is reported and the rest still sync', async () => {
    const data = demoData();
    const box = sampleMailbox(() => DEMO_NOW);
    const flaky = { ...box, search: async (q: string, n: number) => (q.includes('fiber') ? Promise.reject(new Error('Gmail answered 500')) : box.search(q, n)) };
    const result = await syncFromMailbox(flaky, data.sources, data.bills, SAM, DEMO_NOW);
    expect(result.status.errors).toEqual(['Example Fiber: Gmail answered 500']);
    expect(result.writes.some((w) => w.id === 'water_2031-05-12')).toBe(true);
  });
});

describe('discoverSources', () => {
  test('proposes uncovered senders of bill-like email, bills first, never promotions', async () => {
    const proposals = await discoverSources(sampleMailbox(() => DEMO_NOW), DEMO_SOURCES);
    const names = proposals.map((p) => p.name);
    expect(names).toContain('Example Gas Co');
    expect(names).toContain('Example Mobile');
    expect(names).not.toContain('Example Power Co');
    expect(names).not.toContain('Example Deals');
    const gas = proposals.find((p) => p.name === 'Example Gas Co')!;
    expect(gas.kind).toBe('gas');
    expect(gas.preview).toMatchObject({ kind: 'statement', due: '2031-05-28', amountDue: usd('40.00') });
    expect(proposals.find((p) => p.name === 'Example Mobile')!.kind).toBe('phone');
  });
});

test('expired Gmail access stops the whole check', async () => {
  const data = demoData();
  const box = sampleMailbox(() => DEMO_NOW);
  const expired = { ...box, search: async () => Promise.reject(Object.assign(new Error('Gmail access has ended'), { status: 401 })) };
  await expect(syncFromMailbox(expired, data.sources, data.bills, SAM, DEMO_NOW)).rejects.toThrow('Gmail access has ended');
});
