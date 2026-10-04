import { describe, expect, test } from 'bun:test';
import type { Contact } from '@huishouden/pwa-kit/contact-core';
import { detailChoices, prefillFor, refill, rememberedPay, venmoHandle, type Details } from './payDetails';
import { payFields } from './model';

const contact = (extra: Partial<Contact> = {}): Contact => ({ id: 'c1', name: 'Example Rentals', apps: ['bills'], private: false, createdAt: 1, by: 'sam@example.com', ...extra });
const phoneOnly = contact({ phone: '(555) 010-2231' });
const both = contact({ phone: '(555) 010-2231', email: 'landlord@example.com' });
const saved = contact({ phone: '(555) 010-2231', email: 'landlord@example.com', pay: { zelle: 'landlord@example.com' } });
const empty: Details = { payNote: '', payUrl: '' };

describe('details the payee offers', () => {
  test('Zelle: the saved one first, then the phone and the email, without repeats', () => {
    expect(detailChoices(both, 'zelle')).toEqual([
      { value: '(555) 010-2231', from: 'phone' },
      { value: 'landlord@example.com', from: 'email' },
    ]);
    expect(detailChoices(saved, 'zelle').map((c) => c.from)).toEqual(['saved', 'phone']);
  });

  test('Venmo the phone or a saved @handle; a check the address; a portal an https website; bank only what was saved', () => {
    expect(detailChoices(both, 'venmo')).toEqual([{ value: '(555) 010-2231', from: 'phone' }]);
    expect(detailChoices(contact({ address: '1 Example St, Springfield' }), 'check')).toEqual([{ value: '1 Example St, Springfield', from: 'address' }]);
    expect(detailChoices(contact({ website: 'https://pay.example.com' }), 'portal')).toEqual([{ value: 'https://pay.example.com', from: 'website' }]);
    expect(detailChoices(contact({ website: 'http://example.com' }), 'portal')).toEqual([]);
    expect(detailChoices(both, 'bank')).toEqual([]);
    expect(detailChoices(contact({ pay: { bank: 'Example Bank 000123' } }), 'bank')).toEqual([{ value: 'Example Bank 000123', from: 'saved' }]);
  });

  test('nothing for cash or card, no method, or no payee', () => {
    expect(detailChoices(both, 'cash')).toEqual([]);
    expect(detailChoices(both, undefined)).toEqual([]);
    expect(detailChoices(undefined, 'zelle')).toEqual([]);
  });

  test('fills in the saved detail, else only a single fitting one', () => {
    expect(prefillFor(phoneOnly, 'zelle')).toBe('(555) 010-2231');
    expect(prefillFor(both, 'zelle')).toBeUndefined();
    expect(prefillFor(saved, 'zelle')).toBe('landlord@example.com');
  });
});

describe('filling in as the payee and method change', () => {
  test('payee then method, or method then payee: the same detail', () => {
    const a = refill(empty, {}, phoneOnly, 'zelle');
    expect(a.details.payNote).toBe('(555) 010-2231');
    expect(a.prefilled).toEqual({ payNote: '(555) 010-2231' });
  });

  test('a new payee replaces what was filled in, never what was typed', () => {
    const first = refill(empty, {}, phoneOnly, 'zelle');
    const other = contact({ id: 'c2', email: 'owner@example.com' });
    expect(refill(first.details, first.prefilled, other, 'zelle').details.payNote).toBe('owner@example.com');
    expect(refill({ ...first.details, payNote: 'typed@example.com' }, first.prefilled, other, 'zelle').details.payNote).toBe('typed@example.com');
    expect(refill({ payNote: 'memo 12', payUrl: '' }, {}, other, 'zelle').details.payNote).toBe('memo 12');
  });

  test('a payee with nothing that fits clears what the last one filled in', () => {
    const first = refill(empty, {}, phoneOnly, 'zelle');
    expect(refill(first.details, first.prefilled, both, 'zelle')).toEqual({ details: empty, prefilled: {} });
    expect(refill(first.details, first.prefilled, undefined, 'zelle').details.payNote).toBe('');
  });

  test('a portal fills the link, and moving to it clears the note it filled in', () => {
    const p = contact({ phone: '(555) 010-2231', pay: { portal: 'https://pay.example.com/rent' } });
    const zelle = refill(empty, {}, p, 'zelle');
    expect(zelle.details).toEqual({ payNote: '(555) 010-2231', payUrl: '' });
    expect(refill(zelle.details, zelle.prefilled, p, 'portal')).toEqual({ details: { payNote: '', payUrl: 'https://pay.example.com/rent' }, prefilled: { payUrl: 'https://pay.example.com/rent' } });
  });
});

describe('remembering on the contact', () => {
  test('the first detail for a way of paying is kept with the others; a later one never replaces it', () => {
    expect(rememberedPay(contact({ pay: { venmo: '@example' } }), 'zelle', ' landlord@example.com ')).toEqual({ venmo: '@example', zelle: 'landlord@example.com' });
    expect(rememberedPay(saved, 'zelle', 'other@example.com')).toBeNull();
    expect(rememberedPay(both, 'cash', 'x')).toBeNull();
    expect(rememberedPay(both, 'zelle', '  ')).toBeNull();
    expect(rememberedPay(undefined, 'zelle', 'x')).toBeNull();
  });

  test('a Venmo username gets its @; phones and handles stay', () => {
    expect(venmoHandle('example-rentals')).toBe('@example-rentals');
    expect(venmoHandle('@example-rentals')).toBe('@example-rentals');
    expect(venmoHandle('5550102231')).toBe('5550102231');
    expect(venmoHandle('(555) 010-2231')).toBe('(555) 010-2231');
    expect(payFields({ payMethod: 'venmo', payNote: 'example-rentals' }).payNote).toBe('@example-rentals');
    expect(payFields({ payMethod: 'zelle', payNote: 'example-rentals' }).payNote).toBe('example-rentals');
  });
});
