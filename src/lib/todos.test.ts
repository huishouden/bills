import { describe, expect, test } from 'bun:test';
import { allDayStart } from '@huishouden/pwa-kit/agenda';
import { memoryStore, applyOps } from '@huishouden/pwa-kit/store';
import { resolveOps, todoDoc, todoOpsAllowed } from '@huishouden/pwa-kit/todos';
import { createActions, type DataKey } from '../data/actions';
import { AGENDA_APP, APP_URL } from './agenda';
import { DEMO_NOW, demoData, type BillsData } from './demo';
import type { Bill } from './model';
import { todoItems } from './todos';
import { viewBills } from './view';

const NOW = DEMO_NOW; // 2031-05-14
const ME = 'alex@example.com';
const LATER = NOW + 3 * 86_400_000;

describe('todoItems for the sample household', () => {
  const items = todoItems(demoData().bills, NOW);

  test('publishes the bills someone has to pay within 30 days: not autopay, paid, skipped or later ones', () => {
    expect(items.map((i) => i.ref).sort()).toEqual(['bill:hoa_2031-06-01', 'bill:manual-insurance', 'bill:power_2031-05-20', 'bill:water_2031-05-12']);
  });

  test('each is the bill: its label, amount, when it was added and its due day, private', () => {
    const power = items.find((i) => i.ref === 'bill:power_2031-05-20')!;
    const bill = demoData().bills.find((b) => b.id === 'power_2031-05-20')!;
    expect(power).toMatchObject({ title: 'Example Power Co', detail: '$120.00', createdAt: bill.createdAt, due: allDayStart('2031-05-20'), url: APP_URL, owner: 'sam@example.com', private: true });
    expect(power.status).toBeUndefined();
  });

  test('Mark paid and Skip are for admins and members, as merges on the bill', () => {
    const power = items.find((i) => i.ref === 'bill:power_2031-05-20')!;
    expect(power.done).toEqual({
      label: 'Mark paid',
      ops: [{ col: 'bills', id: 'power_2031-05-20', data: { status: 'paid', paidAt: '$now', paidBy: '$me', paidVia: 'member', updatedAt: '$now' }, merge: true }],
      roles: ['admin', 'member'],
    });
    expect(power.cancel).toEqual({ label: 'Skip', ops: [{ col: 'bills', id: 'power_2031-05-20', data: { dismissed: true, updatedAt: '$now' }, merge: true }], roles: ['admin', 'member'] });
  });

  test('every item is one the kit and the rules accept', () => {
    for (const i of items) {
      expect(todoOpsAllowed(AGENDA_APP, i.done!.ops)).toBe(true);
      expect(todoOpsAllowed(AGENDA_APP, i.cancel!.ops)).toBe(true);
      expect(() => todoDoc(AGENDA_APP, i, ME, NOW)).not.toThrow();
    }
  });
});

describe('todoItems', () => {
  const base: Bill = {
    id: 'b',
    schema: 'bill/v1',
    source: 'manual',
    kind: 'other',
    label: 'Example Lawn Care',
    due: null,
    amountDue: null,
    status: 'unknown',
    autopay: null,
    createdAt: 5,
    createdBy: 'Sam@Example.com',
    updatedAt: 5,
  };

  test('a bill with no due date or amount is still one to pay, without them', () => {
    const [item] = todoItems([base], NOW);
    expect(item).toMatchObject({ ref: 'bill:b', title: 'Example Lawn Care', createdAt: 5, owner: 'sam@example.com' });
    expect(item.due).toBeUndefined();
    expect(item.detail).toBeUndefined();
  });

  test('autopay with no due date and bills due after 30 days are left out', () => {
    expect(todoItems([{ ...base, autopay: { enrolled: true } }], NOW)).toEqual([]);
    expect(todoItems([{ ...base, due: '2031-06-13' }], NOW)).toHaveLength(1);
    expect(todoItems([{ ...base, due: '2031-06-14' }], NOW)).toEqual([]);
  });
});

/** The sample data after the app's own action, and after the portal running the item's ops. */
function both(id: string, which: 'done' | 'cancel') {
  const store = memoryStore<BillsData, DataKey>(demoData(), () => {});
  const actions = createActions({ ...store.backend, writeSync: async (ops) => store.backend.write(ops) }, store.read, ME, () => LATER);
  const bill = store.read().bills.find((b) => b.id === id)!;
  if (which === 'done') actions.markPaid(bill);
  else actions.skipBill(bill);
  const item = todoItems(demoData().bills, NOW).find((i) => i.ref === `bill:${id}`)!;
  const portal = applyOps(demoData(), resolveOps(item[which]!.ops, { now: LATER, me: ME }) as never);
  return { app: store.read().bills, portal: portal.bills, item };
}

const byId = (l: Bill[]) => [...l].sort((a, b) => a.id.localeCompare(b.id));

describe('running an item from the portal does what the app does', () => {
  test('Mark paid on a one-off bill', () => {
    const { app, portal } = both('power_2031-05-20', 'done');
    expect(byId(portal)).toEqual(byId(app));
    expect(portal.find((b) => b.id === 'power_2031-05-20')).toMatchObject({ status: 'paid', paidAt: LATER, paidBy: ME, paidVia: 'member', updatedAt: LATER });
  });

  test('Mark paid on a repeating bill also adds its next one, under the same id', () => {
    const { app, portal, item } = both('manual-insurance', 'done');
    expect(item.done!.ops[1]).toMatchObject({ col: 'bills', id: 'manual-insurance~2031-09-10', data: { due: '2031-09-10', status: 'due', createdAt: '$now', createdBy: '$me', updatedAt: '$now' } });
    expect(item.done!.ops[1].merge).toBeUndefined();
    expect(byId(portal)).toEqual(byId(app));
  });

  test('Skip marks it skipped (in history) and a repeating one moves on', () => {
    const { app, portal } = both('manual-insurance', 'cancel');
    expect(byId(portal)).toEqual(byId(app));
    const views = viewBills(portal, '2031-05-14');
    expect(views.find((v) => v.bill.id === 'manual-insurance')!.state).toBe('skipped');
    expect(views.find((v) => v.bill.id === 'manual-insurance~2031-09-10')!.state).toBe('upcoming');
  });

  test('a paid or skipped bill is no longer published', () => {
    for (const which of ['done', 'cancel'] as const) {
      const { portal } = both('power_2031-05-20', which);
      expect(todoItems(portal, NOW).some((i) => i.ref === 'bill:power_2031-05-20')).toBe(false);
    }
  });
});
