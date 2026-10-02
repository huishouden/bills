import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseBillEmail, readAutopay, readDate, readDueDate } from './billEmail';
import { htmlToText } from './html';

const DIR = join(import.meta.dir, '__fixtures__', 'emails');

interface Fixture {
  email: { from: string; subject: string; date: string; text?: string; html?: string };
  expected: unknown;
}

describe('parseBillEmail: sample emails', () => {
  for (const file of readdirSync(DIR).sort()) {
    const f = JSON.parse(readFileSync(join(DIR, file), 'utf8')) as Fixture;
    test(file.replace(/\.json$/, ''), () => {
      const got = parseBillEmail({ subject: f.email.subject, text: f.email.text, html: f.email.html, date: Date.parse(f.email.date) });
      expect(got).toEqual(f.expected as never);
    });
  }
});

describe('dates', () => {
  const ref = Date.parse('2031-05-02T12:00:00Z');
  test.each([
    ['May 20, 2031', '2031-05-20'],
    ['Tuesday, May 20, 2031', '2031-05-20'],
    ['Sept. 3, 2031', '2031-09-03'],
    ['3 September 2031', '2031-09-03'],
    ['05/20/2031', '2031-05-20'],
    ['5/20/31', '2031-05-20'],
    ['2031-05-20', '2031-05-20'],
    ['May 20th', '2031-05-20'],
  ])('%p → %p', (text, want) => expect(readDate(text, ref)).toBe(want));

  test('a yearless date in early January read in December is next year', () => {
    expect(readDate('Jan 4', Date.parse('2031-12-28T12:00:00Z'))).toBe('2032-01-04');
  });

  test('impossible dates are not dates', () => {
    expect(readDate('02/30/2031', ref)).toBeNull();
    expect(readDate('13/01/2031', ref)).toBeNull();
  });

  test('"past due" is not a due date label', () => {
    expect(readDueDate('Past due 04/01/2031. Due date 05/20/2031', ref)).toBe('2031-05-20');
  });

  test('a time is not a day', () => expect(readDate('May 20:30', ref)).toBeNull());
});

describe('autopay wording', () => {
  const ref = Date.parse('2031-05-02T12:00:00Z');
  test.each([
    ['Your payment will be automatically drafted on May 20, 2031.', { enrolled: true, nextDraft: '2031-05-20' }],
    ['You are enrolled in AutoPay.', { enrolled: true }],
    ['Your auto-pay is scheduled for 05/20/2031.', { enrolled: true, nextDraft: '2031-05-20' }],
    ['Payment will be deducted from your account.', { enrolled: true }],
    ['You are not enrolled in AutoPay.', { enrolled: false }],
    ['AutoPay is off.', { enrolled: false }],
    ['Sign up for AutoPay and payments will be processed automatically.', null],
    ['Enroll in automatic payments today.', null],
    ['Pay your bill online.', null],
  ] as const)('%p', (text, want) => expect(readAutopay(text, ref)).toEqual(want as never));
});

describe('htmlToText', () => {
  test('cells on one row read as one line; styles, comments and entities go', () => {
    const text = htmlToText('<style>p{}</style><!-- x --><table><tr><td>Amount&nbsp;due</td><td>&#36;5.00</td></tr><tr><td>Due</td><td>May&nbsp;1</td></tr></table>');
    expect(text).toBe('Amount due $5.00\nDue May 1');
  });

  test('zero-width preheader padding is removed', () => {
    expect(htmlToText('<span>Ready&zwnj;&#8203;&#847;</span>')).toBe('Ready');
  });
});
