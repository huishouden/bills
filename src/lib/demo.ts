import type { CardCharge } from '@huishouden/pwa-kit/recurring';
import { addDays, addMonths } from '@huishouden/pwa-kit/time';
import type { Bill, BillSource, BillSuggestion, BillSync } from './model';

// Invented sample household for the signed-out app: README screenshots and first impressions.
// Every date is relative to one fixed day in 2031, every sender is on example.com.

/** Wednesday 14 May 2031, 10:30 local time. The demo's clock starts here. */
export const DEMO_NOW = new Date(2031, 4, 14, 10, 30).getTime();
export const DEMO_MEMBERS = ['sam@example.com', 'alex@example.com'];
const [SAM, ALEX] = DEMO_MEMBERS;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface BillsData {
  bills: Bill[];
  sources: BillSource[];
  syncs: BillSync[];
  /** The household's card spending (Huishouden Spending), for suggested bills. */
  charges: CardCharge[];
  /** Members' answers to suggested bills. */
  answers: BillSuggestion[];
}

const source = (id: string, s: Omit<BillSource, 'id' | 'createdAt' | 'createdBy' | 'updatedAt'>): BillSource => ({
  id,
  ...s,
  createdAt: DEMO_NOW - 60 * DAY,
  createdBy: SAM,
  updatedAt: DEMO_NOW - 60 * DAY,
});

export const DEMO_SOURCES: BillSource[] = [
  source('power', { name: 'Example Power Co', kind: 'electric', from: 'billing@power.example.com', autopay: null }),
  source('water', { name: 'Example Water District', kind: 'water', from: 'water.example.com', autopay: null }),
  source('fiber', { name: 'Example Fiber', kind: 'internet', from: 'fiber.example.com', autopay: null }),
  source('loans', { name: 'Example Home Loans', kind: 'mortgage', from: 'loans.example.com', autopay: true, payUrl: 'https://loans.example.com/pay' }),
  source('hoa', { name: 'Example Commons HOA', kind: 'hoa', label: 'HOA', autopay: null }),
];

const usd = (amount: string) => ({ amount, currency: 'USD' });

function emailBill(sourceId: string, due: string, amount: string, extra: Partial<Bill> = {}): Bill {
  const s = DEMO_SOURCES.find((x) => x.id === sourceId)!;
  const seen = DEMO_NOW - 2 * HOUR;
  return {
    id: `${sourceId}_${due}`,
    schema: 'bill/v1',
    source: 'email',
    sourceId,
    kind: s.kind,
    label: s.name,
    due,
    amountDue: usd(amount),
    status: 'due',
    autopay: s.autopay === null ? null : { enrolled: s.autopay },
    ...(s.payUrl ? { payUrl: s.payUrl } : {}),
    emailId: `demo-${sourceId}-${due}`,
    createdAt: seen,
    createdBy: SAM,
    updatedAt: seen,
    observedAt: seen,
    ...extra,
  };
}

export function demoData(): BillsData {
  const bills: Bill[] = [
    emailBill('power', '2031-05-20', '120.00', { autopay: { enrolled: false }, period: { start: '2031-04-01', end: '2031-04-30' } }),
    emailBill('fiber', '2031-05-16', '80.00', { autopay: { enrolled: true, nextDraft: '2031-05-16' } }),
    emailBill('water', '2031-05-12', '90.00', { period: { start: '2031-01-01', end: '2031-03-31' } }),
    emailBill('loans', '2031-06-01', '2000.00', { autopay: { enrolled: true, nextDraft: '2031-06-01' } }),
    emailBill('hoa', '2031-06-01', '300.00'),
    {
      id: 'manual-insurance',
      schema: 'bill/v1',
      source: 'manual',
      kind: 'insurance',
      label: 'Example Mutual',
      due: '2031-06-10',
      amountDue: usd('600.00'),
      status: 'due',
      autopay: { enrolled: false },
      repeat: 'quarterly',
      createdAt: DEMO_NOW - 40 * DAY,
      createdBy: ALEX,
      updatedAt: DEMO_NOW - 40 * DAY,
    },
    // History
    emailBill('power', '2031-04-20', '110.00', { status: 'paid', autopay: { enrolled: false }, paidAt: DEMO_NOW - 26 * DAY, paidBy: SAM, paidVia: 'member' }),
    emailBill('fiber', '2031-04-16', '80.00', { autopay: { enrolled: true, nextDraft: '2031-04-16' } }),
    emailBill('loans', '2031-05-01', '2000.00', { autopay: { enrolled: true, nextDraft: '2031-05-01' } }),
    emailBill('water', '2031-02-10', '85.00', { status: 'paid', paidAt: DEMO_NOW - 95 * DAY, paidVia: 'email' }),
  ];
  // Added from card spending earlier: a subscription charged to a card.
  bills.push({
    id: 'manual-hulu',
    schema: 'bill/v1',
    source: 'manual',
    kind: 'other',
    label: 'Hulu',
    due: '2031-05-28',
    amountDue: usd('17.99'),
    status: 'due',
    autopay: { enrolled: true, via: 'card' },
    repeat: 'monthly',
    createdAt: DEMO_NOW - 20 * DAY,
    createdBy: SAM,
    updatedAt: DEMO_NOW - 20 * DAY,
  });
  const syncs: BillSync[] = [{ id: SAM, checkedAt: DEMO_NOW - 2 * HOUR, by: SAM, sources: 5, emails: 9, bills: 1, errors: [] }];
  const answers: BillSuggestion[] = [{ id: 'hulu', status: 'added', name: 'Hulu', billId: 'manual-hulu', by: SAM, at: DEMO_NOW - 20 * DAY }];
  return { bills, sources: DEMO_SOURCES.map((s) => ({ ...s })), syncs, charges: demoCharges(), answers };
}

const TODAY = '2031-05-14';

/** Monthly on a day of the month, `count` times, the last on or before the sample's today. */
function monthly(day: string, count: number, description: string, amount: number, category: string): CardCharge[] {
  return Array.from({ length: count }, (_, i) => ({ date: addMonths(day, i - count + 1), description, amount, category, type: 'Sale' }));
}

/**
 * A year of invented card spending: a few clear subscriptions (one already a bill, one a bill
 * source's internet charged to the card) among everyday shopping that never repeats on a schedule.
 */
export function demoCharges(): CardCharge[] {
  const out: CardCharge[] = [
    ...monthly('2031-05-09', 12, 'NETFLIX.COM 800-555-0101 CA', 22.99, 'Subscriptions & Tech'),
    ...monthly('2031-05-03', 10, 'PAYPAL *SPOTIFY P2A5C9', 11.99, 'Subscriptions & Tech'),
    ...monthly('2031-05-06', 8, 'PLANET FITNESS #0412 SPRINGFIELD', 24.99, 'Health & Personal Care'),
    ...monthly('2031-04-28', 11, 'HULU 877-555-0105 HULU.COM CA', 17.99, 'Subscriptions & Tech'),
    ...monthly('2031-04-16', 9, 'EXAMPLE FIBER WEB PMT', 80, 'Bills & Utilities'),
    { date: '2030-05-12', description: 'AMAZON PRIME*2K3J45', amount: 139, category: 'Shopping & Retail', type: 'Sale' },
    { date: '2031-05-12', description: 'Amazon Prime Membership', amount: 139, category: 'Shopping & Retail', type: 'Sale' },
  ];
  // Everyday shopping on no schedule: groceries, fuel, dining, a refund.
  const everyday: [number, string, number, string][] = [
    [2, "TRADER JOE'S", 142.8, 'Groceries'],
    [4, 'Costco Wholesale', 284.15, 'Groceries'],
    [5, 'Chevron Fuel', 52.4, 'Gas & Transport'],
    [9, 'Target Store #1128', 76.9, 'Shopping & Retail'],
    [11, "TRADER JOE'S", 98.4, 'Groceries'],
    [13, 'Chipotle Mexican Grill', 34.6, 'Dining & Food'],
    [17, 'Home Depot', 135.2, 'Home & Garden'],
    [20, "TRADER JOE'S", 156.35, 'Groceries'],
    [24, 'Shell Oil', 48.2, 'Gas & Transport'],
    [26, 'Amazon.com', 45.6, 'Shopping & Retail'],
    [31, 'Costco Wholesale', 312.45, 'Groceries'],
    [33, 'Chevron Fuel', 61.2, 'Gas & Transport'],
    [38, "TRADER JOE'S", 121, 'Groceries'],
    [44, 'Chipotle Mexican Grill', 28.1, 'Dining & Food'],
    [52, 'Amazon.com', -45.6, 'Shopping & Retail'],
    [57, 'Costco Wholesale', 275.6, 'Groceries'],
    [66, 'Shell Oil', 55.75, 'Gas & Transport'],
  ];
  for (const [ago, description, amount, category] of everyday) out.push({ date: addDays(TODAY, -ago), description, amount, category, type: amount < 0 ? 'Return' : 'Sale' });
  return out;
}
