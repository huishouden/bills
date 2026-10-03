import { describe, expect, test } from 'bun:test';
import { memoryStore } from '@huishouden/pwa-kit/store';
import { DEMO_NOW, demoData, type BillsData } from '../lib/demo';
import { createActions, type DataKey, type Op } from './actions';

// The actions over the kit's memory backend, recording every write as the live store's batches would.
function setup() {
  const writes: Op[][] = [];
  const store = memoryStore<BillsData, DataKey>(demoData(), () => {});
  const write = (ops: Op[]) => {
    writes.push(ops);
    store.backend.write(ops);
  };
  const actions = createActions({ newId: store.backend.newId, write, writeSync: async (ops) => write(ops) }, store.read, 'sam@example.com', () => DEMO_NOW);
  return { actions, writes, read: store.read };
}
const sorted = <T extends { id: string }>(l: T[]) => [...l].sort((a, b) => a.id.localeCompare(b.id));

describe('bills actions', () => {
  test('paying a repeating bill adds its next one in the same write; Undo puts both back', () => {
    const { actions, writes, read } = setup();
    const before = read();
    const bill = before.bills.find((b) => b.source === 'manual' && b.repeat && b.status !== 'paid')!;
    const undo = actions.markPaid(bill);
    expect(writes.at(-1)!.map((o) => o.col)).toEqual(['bills', 'bills']);
    expect(read().bills.find((b) => b.id === bill.id)).toMatchObject({ status: 'paid', paidBy: 'sam@example.com', paidVia: 'member' });
    expect(read().bills).toHaveLength(before.bills.length + 1);
    undo();
    expect(sorted(read().bills)).toEqual(sorted(before.bills));
  });

  test('the next one of a repeating bill has the id the portal and rollovers use', () => {
    const { actions, read } = setup();
    const bill = read().bills.find((b) => b.id === 'manual-insurance')!;
    actions.markPaid(bill);
    expect(read().bills.find((b) => b.id === 'manual-insurance~2031-09-10')).toMatchObject({ due: '2031-09-10', status: 'due', createdAt: DEMO_NOW });
  });

  test('skipping marks the bill skipped and adds a repeating one\'s next; Undo puts both back', () => {
    const { actions, writes, read } = setup();
    const before = read();
    const bill = before.bills.find((b) => b.id === 'manual-insurance')!;
    const undo = actions.skipBill(bill);
    expect(writes.at(-1)![0]).toEqual({ col: 'bills', id: bill.id, data: { dismissed: true, updatedAt: DEMO_NOW }, merge: true });
    expect(read().bills.find((b) => b.id === bill.id)).toMatchObject({ dismissed: true, status: 'due' });
    expect(read().bills.find((b) => b.id === 'manual-insurance~2031-09-10')).toMatchObject({ due: '2031-09-10', status: 'due' });
    expect(read().bills.find((b) => b.id === 'manual-insurance~2031-09-10')!.dismissed).toBeUndefined();
    undo();
    expect(sorted(read().bills)).toEqual(sorted(before.bills));
  });

  test('a skipped bill can be put back', () => {
    const { actions, read } = setup();
    const bill = read().bills.find((b) => b.id === 'manual-window-cleaning')!;
    actions.unskipBill(bill);
    expect(read().bills.find((b) => b.id === bill.id)).toMatchObject({ dismissed: false, updatedAt: DEMO_NOW });
  });

  test('removing an email bill only hides it; a manual one is deleted', () => {
    const { actions, writes, read } = setup();
    const email = read().bills.find((b) => b.source !== 'manual')!;
    actions.removeBill(email);
    expect(writes.at(-1)).toEqual([{ col: 'bills', id: email.id, data: { dismissed: true, updatedAt: DEMO_NOW }, merge: true }]);
    expect(read().bills.find((b) => b.id === email.id)).toMatchObject({ ...email, dismissed: true, updatedAt: DEMO_NOW });
    const manual = read().bills.find((b) => b.source === 'manual')!;
    actions.removeBill(manual);
    expect(read().bills.some((b) => b.id === manual.id)).toBe(false);
    actions.restoreBill(manual);
    expect(read().bills.find((b) => b.id === manual.id)).toEqual(manual);
  });

  test('deleting a source takes its unpaid bills, keeps paid ones; Undo restores them', () => {
    const { actions, read } = setup();
    const before = read();
    const source = before.sources[0];
    const undo = actions.deleteSource(source);
    expect(read().sources.some((s) => s.id === source.id)).toBe(false);
    expect(read().bills.filter((b) => b.sourceId === source.id).every((b) => b.status === 'paid')).toBe(true);
    undo();
    expect(sorted(read().bills)).toEqual(sorted(before.bills));
    expect(sorted(read().sources)).toEqual(sorted(before.sources));
  });

  test('renaming a source renames its bills in place', () => {
    const { actions, read } = setup();
    const source = read().sources[0];
    actions.saveSource(source.id, { ...source, name: 'Renamed' });
    for (const b of read().bills.filter((x) => x.sourceId === source.id)) expect(b).toMatchObject({ label: 'Renamed', updatedAt: DEMO_NOW });
  });

  test('a suggestion becomes a bill and an answer; Undo removes both', () => {
    const { actions, read } = setup();
    const before = read();
    const candidate = { merchantKey: 'netflix' } as Parameters<typeof actions.addSuggestion>[0];
    const undo = actions.addSuggestion(candidate, { label: 'Streaming', kind: 'other', due: '2031-06-01', repeat: 'monthly' } as Parameters<typeof actions.addSuggestion>[1]);
    const answer = read().answers.at(-1)!;
    expect(answer).toMatchObject({ status: 'added', name: 'Streaming', by: 'sam@example.com' });
    expect(read().bills.some((b) => b.id === answer.billId)).toBe(true);
    undo();
    expect(sorted(read().bills)).toEqual(sorted(before.bills));
    expect(read().answers).toEqual(before.answers);
  });

  test('an email check writes its bills and the member’s status together', async () => {
    const { actions, writes, read } = setup();
    const status = { checkedAt: DEMO_NOW, by: 'sam@example.com', sources: 1, emails: 0, bills: 0, errors: [] };
    await actions.applySync({ writes: [], status });
    expect(writes.at(-1)).toEqual([{ col: 'syncs', id: 'sam@example.com', data: status }]);
    expect(read().syncs.find((s) => s.id === 'sam@example.com')).toEqual({ id: 'sam@example.com', ...status });
  });
});
