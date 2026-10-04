import { describe, expect, test } from 'bun:test';
import { demoData } from './demo';
import type { Bill } from './model';
import { payAction, payInfo, payLine } from './pay';

const data = demoData();
const rent = data.bills.find((b) => b.id === 'manual-rent~2031-06-08')!;

describe('how a bill is paid', () => {
  test("rent: Zelle to the landlord, with the contact's details", () => {
    const info = payInfo(rent, data.sources, data.contacts);
    expect(info.payee?.name).toBe('Example Rentals');
    expect(payLine(info)).toBe('Zelle to Example Rentals');
    expect(payAction(info)).toBe('Pay Example Rentals by Zelle');
  });

  test("an email bill takes its source's, and its own win", () => {
    const sources = data.sources.map((s) => (s.id === 'power' ? { ...s, payMethod: 'portal' as const, payeeContactId: 'landlord' } : s));
    const power = data.bills.find((b) => b.id === 'power_2031-05-20')!;
    expect(payLine(payInfo(power, sources, data.contacts))).toBe('Online portal to Example Rentals');
    const own: Bill = { ...power, payMethod: 'check' };
    expect(payAction(payInfo(own, sources, data.contacts))).toBe('Pay Example Rentals by check');
  });

  test('only what is known: a method, a payee, or nothing; a removed contact is no payee', () => {
    expect(payLine(payInfo({ ...rent, payeeContactId: undefined }, [], []))).toBe('Zelle');
    expect(payAction(payInfo({ ...rent, payeeContactId: undefined }, [], []))).toBe('Pay by Zelle');
    expect(payLine(payInfo({ ...rent, payMethod: undefined }, [], data.contacts))).toBe('Pay Example Rentals');
    expect(payLine(payInfo({ ...rent, payMethod: undefined, payeeContactId: 'gone' }, [], data.contacts))).toBeNull();
    expect(payAction(payInfo({ ...rent, payMethod: undefined, payeeContactId: undefined }, [], []))).toBeNull();
  });
});
