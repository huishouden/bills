import { describe, expect, test } from 'bun:test';
import { autopayRollovers, nextRepeat } from './build';
import { manualBillDoc, type Bill, type ManualBillInput } from '../lib/model';

const SAM = 'sam@example.com';
const make = (id: string, over: Partial<ManualBillInput> = {}, extra: Partial<Bill> = {}): Bill => ({
  id,
  ...manualBillDoc({ label: 'Netflix', kind: 'other', due: '2031-05-09', amount: '22.99', autopay: true, autopayVia: 'card', repeat: 'monthly', ...over }, SAM, 1, 1),
  ...extra,
});

describe('nextRepeat', () => {
  test('weekly is seven days on; monthly keeps the day', () => {
    expect(nextRepeat(make('a', { repeat: 'weekly' }), SAM, 2)?.due).toBe('2031-05-16');
    expect(nextRepeat(make('a'), SAM, 2)).toMatchObject({ due: '2031-06-09', autopay: { enrolled: true, via: 'card' } });
  });
});

describe('autopayRollovers', () => {
  test('a repeating autopay bill whose day passed gets the next one, with an id both members agree on', () => {
    expect(autopayRollovers([make('abc')], '2031-05-14', SAM, 5)).toEqual([{ id: 'abc~2031-06-09', data: { ...nextRepeat(make('abc'), SAM, 5)!, due: '2031-06-09' } }]);
    expect(autopayRollovers([make('abc~2031-06-09', { due: '2031-06-09' })], '2031-06-10', SAM, 5)[0].id).toBe('abc~2031-07-09');
  });

  test('several missed weeks: only the next one, after today', () => {
    expect(autopayRollovers([make('w', { repeat: 'weekly', due: '2031-04-01' })], '2031-05-14', SAM, 5).map((r) => r.data.due)).toEqual(['2031-05-20']);
  });

  test('nothing when the next is there, it is not due yet, it was paid, autopay is off or it does not repeat', () => {
    expect(autopayRollovers([make('a'), make('b', { due: '2031-06-09' })], '2031-05-14', SAM, 5)).toEqual([]);
    expect(autopayRollovers([make('a', { due: '2031-05-14' })], '2031-05-14', SAM, 5)).toEqual([]);
    expect(autopayRollovers([make('a', {}, { status: 'paid' })], '2031-05-14', SAM, 5)).toEqual([]);
    expect(autopayRollovers([make('a', { autopay: false })], '2031-05-14', SAM, 5)).toEqual([]);
    expect(autopayRollovers([make('a', { repeat: null })], '2031-05-14', SAM, 5)).toEqual([]);
    expect(autopayRollovers([make('a', {}, { dismissed: true })], '2031-05-14', SAM, 5)).toEqual([]);
  });
});
