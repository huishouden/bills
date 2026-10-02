import { describe, expect, test } from 'bun:test';
import { discoveryQuery, fromCovers, guessKind, labelToken, parseSender, senderName, sourceQuery } from './gmailQuery';
import { decodeBase64Url, encodeBase64Url, toMailMessage } from './gmailMessage';
import gmailMessage from './__fixtures__/gmail-message.json' with { type: 'json' };

describe('Gmail searches', () => {
  test('a source becomes from/subject/label terms within the lookback', () => {
    expect(sourceQuery({ from: 'billing@power.example.com' })).toBe('from:(billing@power.example.com) newer_than:60d');
    expect(sourceQuery({ subject: 'statement ready', label: 'Bills/Home Loan' }, 30)).toBe('subject:(statement ready) label:bills-home-loan newer_than:30d');
  });

  test('quotes and parentheses in household data cannot change the search', () => {
    expect(sourceQuery({ from: 'x) OR (y', subject: '"a"' })).toBe('from:(x OR y) subject:(a) newer_than:60d');
    expect(labelToken('Bills / Utilities')).toBe('bills-utilities');
  });

  test('the discovery search looks for statement wording and skips promotions', () => {
    const q = discoveryQuery();
    expect(q).toContain('"amount due"');
    expect(q).toContain('-category:promotions');
  });
});

describe('senders', () => {
  test('parses display name and address', () => {
    expect(parseSender('"Example Power Co" <Billing@Power.Example.com>')).toEqual({ name: 'Example Power Co', address: 'billing@power.example.com', domain: 'power.example.com' });
    expect(parseSender('billing@example.com')).toEqual({ name: '', address: 'billing@example.com', domain: 'example.com' });
  });

  test('names drop "Billing" and "no-reply"; a bare address uses its domain', () => {
    expect(senderName(parseSender('Example Fiber Billing <a@fiber.example.com>'))).toBe('Example Fiber');
    expect(senderName(parseSender('no-reply@examplewater.com'))).toBe('Examplewater');
  });

  test('a domain source covers its subdomains; an address source only itself', () => {
    const s = parseSender('X <billing@power.example.com>');
    expect(fromCovers('example.com', s)).toBe(true);
    expect(fromCovers('billing@power.example.com', s)).toBe(true);
    expect(fromCovers('other@power.example.com', s)).toBe(false);
    expect(fromCovers(undefined, s)).toBe(false);
  });

  test.each([
    ['Example Home Loans', 'mortgage'],
    ['Example Commons Association', 'hoa'],
    ['Example Mutual Insurance', 'insurance'],
    ['Example Power & Light', 'electric'],
    ['Example Water Utility', 'water'],
    ['Example Fiber Internet', 'internet'],
    ['Example Wireless', 'phone'],
    ['Example Store', 'other'],
  ])('%p guessed as %p', (name, kind) => expect(guessKind(name)).toBe(kind as never));
});

describe('Gmail messages', () => {
  test('base64url round trip keeps UTF-8', () => {
    const s = 'Amount due — $5.00 · é';
    expect(decodeBase64Url(encodeBase64Url(s))).toBe(s);
  });

  test('headers, date and the nested text and HTML parts are read; attachments ignored', () => {
    const m = toMailMessage(gmailMessage);
    expect(m.id).toBe('msg-0001');
    expect(m.from).toBe('Example Power Co <billing@power.example.com>');
    expect(m.subject).toBe('Your bill is ready');
    expect(m.date).toBe(Date.parse('2031-05-02T13:00:00Z'));
    expect(m.text).toBe('Amount due: $120.00\nDue date: May 20, 2031\n');
    expect(m.html).toContain('<td>$120.00</td>');
  });
});
