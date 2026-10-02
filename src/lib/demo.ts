import type { Bill, BillSource, BillSync } from './model';

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
  const syncs: BillSync[] = [{ id: SAM, checkedAt: DEMO_NOW - 2 * HOUR, by: SAM, sources: 5, emails: 9, bills: 1, errors: [] }];
  return { bills, sources: DEMO_SOURCES.map((s) => ({ ...s })), syncs };
}
