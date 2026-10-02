import { htmlToText, tidy } from '@huishouden/pwa-kit/gmail';
import { toDecimal, usd } from '@huishouden/pwa-kit/money';
import { isYmd, ymd } from '@huishouden/pwa-kit/time';
import type { Autopay, Money, Ymd } from './model';

/**
 * Reads a bill email the way a person skims it: the amount next to "Amount due", the date next to
 * "Due date", whether it says the payment will be drafted automatically, and the billing period.
 * Generic wording only: nothing here knows any provider.
 */

export interface BillEmail {
  subject: string;
  /** text/plain part, when the email has one. */
  text?: string;
  /** text/html part, when the email has one. */
  html?: string;
  /** When the email arrived, ms since epoch; dates without a year are read relative to it. */
  date: number;
}

export type EmailKind = 'statement' | 'payment' | 'other';

export interface ParsedBillEmail {
  kind: EmailKind;
  amountDue: Money | null;
  due: Ymd | null;
  /** null when the email doesn't say (offering autopay is not saying). */
  autopay: Autopay | null;
  period: { start: Ymd; end: Ymd } | null;
  /** For a payment confirmation: the amount paid, when stated. */
  paid: Money | null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const WEEKDAY = '(?:(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?\\.?,?\\s+)?';
const DATE_SRC =
  `${WEEKDAY}(?:(${MONTH})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?![\\d:])` +
  `|(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH})\\.?,?\\s+(\\d{4})` +
  `|(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4}|\\d{2})(?!\\d)` +
  `|(\\d{4})-(\\d{2})-(\\d{2}))`;
const DATE = new RegExp(DATE_SRC, 'i');

const MONEY_SRC = '(-\\s*|\\(\\s*)?\\$\\s?(\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.(\\d{2}))?(\\s*\\))?(\\s?cr\\b)?';
const MONEY = new RegExp(MONEY_SRC, 'i');

/** A date found in text, with the year inferred from `ref` when the text leaves it out. */
export function readDate(text: string, ref: number): Ymd | null {
  const m = DATE.exec(text);
  return m ? dateFromMatch(m, ref) : null;
}

function monthIndex(name: string): number {
  return MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;
}

function dateFromMatch(m: RegExpExecArray, ref: number): Ymd | null {
  let y: number | null, mo: number, d: number;
  if (m[1]) [y, mo, d] = [m[3] ? Number(m[3]) : null, monthIndex(m[1]), Number(m[2])];
  else if (m[5]) [y, mo, d] = [Number(m[6]), monthIndex(m[5]), Number(m[4])];
  else if (m[7]) [y, mo, d] = [Number(m[9].length === 2 ? `20${m[9]}` : m[9]), Number(m[7]), Number(m[8])];
  else [y, mo, d] = [Number(m[10]), Number(m[11]), Number(m[12])];
  if (y !== null) return validYmd(y, mo, d);
  // No year: the one that puts the date closest to when the email arrived.
  const refYear = new Date(ref).getFullYear();
  let best: Ymd | null = null;
  let bestGap = Infinity;
  for (const year of [refYear - 1, refYear, refYear + 1]) {
    const ymd = validYmd(year, mo, d);
    if (!ymd) continue;
    const gap = Math.abs(new Date(year, mo - 1, d).getTime() - ref);
    if (gap < bestGap) [best, bestGap] = [ymd, gap];
  }
  return best;
}

/** Groups 1-5 of MONEY_SRC: sign or opening parenthesis, whole dollars, cents, closing parenthesis, "CR". */
function moneyFromMatch(m: RegExpExecArray): Money | null {
  const negative = !!m[1] || !!m[5];
  const amount = toDecimal(`${m[2].replace(/,/g, '')}.${m[3] ?? '00'}`);
  if (amount === null) return null;
  return usd(negative && amount !== '0.00' ? `-${amount}` : amount);
}

/** Labels for the amount owed, most specific first. */
const AMOUNT_LABELS = [
  /credit balance(?: of)?/i,
  /total amount due/i,
  /total (?:amount|balance) owed/i,
  /amount due/i,
  /total balance due/i,
  /balance due/i,
  /total due/i,
  /amount (?:you )?owe/i,
  /amount to pay/i,
  /new balance/i,
  /current balance/i,
  /statement balance/i,
  /amount of your (?:bill|statement)/i,
  /(?:bill|statement) amount/i,
  /(?:monthly |regular )?payment amount/i,
  /total (?:current )?charges/i,
  /current charges/i,
  /your (?:new |monthly )?(?:bill|statement|payment) (?:is|of|for)/i,
  new RegExp(`${'(?:auto\\s?-?pay|automatic payment)'} (?:payment )?(?:of|amount)`, 'i'),
  /\bamount\s*:/i,
];

/** Money first, then the words: "$120.00 is due on May 14", "$80.00 will be drafted". */
const MONEY_FIRST = new RegExp(`${MONEY_SRC}\\s+(?:is |will be )?(?:(?:now )?due|(?:automatically )?(?:drafted|deducted|debited|withdrawn|charged))`, 'i');

const WINDOW = 90;


function amountNear(text: string, label: RegExp): Money | null {
  const g = new RegExp(label.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = g.exec(text))) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + WINDOW);
    // Stop at the next sentence or the next label, so "Amount due. Payments of $5.00…" can't borrow.
    const cut = after.search(/[.!?]\s|\n\n/);
    const span = cut >= 0 ? after.slice(0, cut + 1) : after;
    const money = MONEY.exec(span);
    if (money) {
      const found = moneyFromMatch(money);
      if (found && /credit/i.test(m[0]) && !found.amount.startsWith('-') && found.amount !== '0.00') return usd(`-${found.amount}`);
      return found;
    }
  }
  return null;
}

export function readAmountDue(text: string): Money | null {
  for (const label of AMOUNT_LABELS) {
    const found = amountNear(text, label);
    if (found) return found;
  }
  const m = MONEY_FIRST.exec(text);
  return m ? moneyFromMatch(m) : null;
}

const DUE_LABELS = [
  /(?:payment )?due date/i,
  /(?:payment )?due (?:on|by)/i,
  /please pay by/i,
  /pay by/i,
  /(?:is|are) due/i,
  /payment due/i,
  /\bdue\b/i,
];

export function readDueDate(text: string, ref: number): Ymd | null {
  for (const label of DUE_LABELS) {
    const g = new RegExp(label.source, 'gi');
    let m: RegExpExecArray | null;
    while ((m = g.exec(text))) {
      // "past due" is an amount label, not a date.
      const before = text.slice(Math.max(0, m.index - 6), m.index).toLowerCase();
      if (/past\s*$/.test(before)) continue;
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 60);
      const cut = after.search(/[!?]\s|\n\n/);
      const date = readDate(cut >= 0 ? after.slice(0, cut) : after, ref);
      if (date) return date;
    }
  }
  return null;
}

const PERIOD = new RegExp(
  `(?:(?:billing|statement|service|bill|usage)\\s+(?:period|cycle|dates?)|service\\s+from|for\\s+service)\\s*:?\\s*(?:from\\s+)?(${DATE_SRC.replace(/\((?!\?)/g, '(?:')})\\s*(?:-|–|—|to|through|thru)\\s*(${DATE_SRC.replace(/\((?!\?)/g, '(?:')})`,
  'i',
);

export function readPeriod(text: string, ref: number): { start: Ymd; end: Ymd } | null {
  const m = PERIOD.exec(text);
  if (!m) return null;
  const end = readDate(m[2], ref);
  if (!end) return null;
  // "Apr 1 – Apr 30, 2031": the start borrows the end's year.
  const endMs = new Date(Number(end.slice(0, 4)), Number(end.slice(5, 7)) - 1, Number(end.slice(8, 10))).getTime();
  const start = readDate(m[1], endMs - 15 * 86_400_000);
  if (!start || start > end) return null;
  return { start, end };
}

/** Any character inside one sentence; a period counts only as a decimal point ("$130.00"). */
const FILL = '(?:[^.!?\\n]|\\.(?=\\d))';
const AUTOPAY_WORD = '(?:auto\\s?-?pay|automatic (?:payments?|bill ?pay|drafts?|debits?)|auto-?drafts?|autodrafts?|direct debits?|recurring payments?|automatic monthly payments?)';
const MARKETING = new RegExp(`\\b(?:enroll|sign up|set up|switch to|try|turn on|start using|consider)\\b${FILL}{0,25}${AUTOPAY_WORD}`, 'i');
const ENROLLED = new RegExp(`\\b(?:you(?:'re|’re| are)|account is|you have been|you've been|you’ve been) (?:currently )?(?:enrolled|signed up|set up|registered) (?:in|for|with) ${AUTOPAY_WORD}`, 'i');
const NEGATIVE = [
  new RegExp(`\\bnot (?:currently |yet )?(?:enrolled|signed up|set up|registered) (?:in|for|with) ${AUTOPAY_WORD}`, 'i'),
  new RegExp(`\\b${AUTOPAY_WORD} (?:is |are )?(?:off|not (?:active|enabled|set up|on)|inactive|cancel+ed|turned off|disabled)\\b`, 'i'),
  new RegExp(`\\b(?:no|without) ${AUTOPAY_WORD}\\b`, 'i'),
];
const POSITIVE = [
  ENROLLED,
  new RegExp(`\\b${AUTOPAY_WORD}\\b${FILL}{0,80}?\\b(?:(?:is|are) (?:on|active|enabled|set up|scheduled)|scheduled|will (?:be )?(?:process(?:ed)?|draft(?:ed)?|debit(?:ed)?|deduct(?:ed)?|withdraw(?:n)?|charge(?:d)?|pay|occur|run)|(?:was|has been) (?:processed|drafted|debited|deducted|withdrawn|paid|charged|made|received))`, 'i'),
  /\bwill be (?:automatically )?(?:drafted|deducted|debited|withdrawn)\b/i,
  /\bwill be automatically (?:charged|paid|processed)\b/i,
  /\b(?:scheduled|set) to be (?:automatically )?(?:drafted|deducted|debited|withdrawn|paid|charged)\b/i,
  new RegExp(`\\bno (?:action|payment) (?:is )?(?:needed|required)\\b${FILL}{0,80}${AUTOPAY_WORD}|${AUTOPAY_WORD}${FILL}{0,80}\\bno (?:action|payment) (?:is )?(?:needed|required)\\b`, 'i'),
  new RegExp(`\\bdo not (?:pay|send a payment)\\b${FILL}{0,80}(?:${AUTOPAY_WORD}|automatically)`, 'i'),
];

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
}

const DRAFT_DATE = new RegExp(`(?:drafted|deducted|debited|withdrawn|charged|paid|processed|scheduled|occur|run)\\b${FILL}{0,60}?\\b(?:on|for)\\s+(.{0,40})`, 'i');

export function readAutopay(text: string, ref: number): Autopay | null {
  const list = sentences(text);
  for (const s of list) if (NEGATIVE.some((r) => r.test(s))) return { enrolled: false };
  const relevant = list.filter((s) => !MARKETING.test(s) || ENROLLED.test(s));
  if (!relevant.some((s) => POSITIVE.some((r) => r.test(s)))) return null;
  // The draft date may sit in the sentence after "You are enrolled in AutoPay."
  for (const s of relevant) {
    const draft = DRAFT_DATE.exec(s);
    const nextDraft = draft ? readDate(draft[1], ref) : null;
    if (nextDraft) return { enrolled: true, nextDraft };
  }
  return { enrolled: true };
}

const PAYMENT_SUBJECT =
  /(thank you for your (?:recent |online |auto ?pay |automatic )?payment|payment (?:has been |was )?(?:received|processed|posted|confirmed|successful|complete)|we(?:'ve|’ve| have)? received your payment|payment confirmation|payment receipt|your (?:automatic |auto ?pay |scheduled )?payment (?:of \$[\d,.]+ )?(?:has been|was|is) (?:received|processed|posted|successful|complete))/i;

const PAID = new RegExp(`payment (?:of|amount:?)\\s*${MONEY_SRC}`, 'i');

function parseText(subject: string, body: string, date: number): ParsedBillEmail {
  const text = tidy(`${subject}\n${body}`);
  const amountDue = readAmountDue(text);
  const autopay = readAutopay(text, date);
  let due = readDueDate(text, date);
  if (!due && autopay?.nextDraft) due = autopay.nextDraft;
  const period = readPeriod(text, date);
  const statement = !!amountDue || !!due;
  const paymentWords = PAYMENT_SUBJECT.test(subject) || (!statement && PAYMENT_SUBJECT.test(text.slice(0, 600)));
  if (paymentWords) {
    const paid = PAID.exec(text);
    return { kind: 'payment', amountDue: null, due: null, autopay, period: null, paid: paid ? moneyFromMatch(paid) : null };
  }
  return { kind: statement ? 'statement' : 'other', amountDue, due, autopay, period, paid: null };
}

/** Parses the HTML part when there is one (it usually holds the full statement), else the text part. */
export function parseBillEmail(email: BillEmail): ParsedBillEmail {
  const bodies = [email.html ? htmlToText(email.html) : '', email.text ? tidy(email.text) : ''].filter(Boolean);
  if (!bodies.length) bodies.push('');
  let first: ParsedBillEmail | null = null;
  for (const body of bodies) {
    const parsed = parseText(email.subject, body, email.date);
    if (parsed.kind !== 'other') return parsed;
    first ??= parsed;
  }
  return first!;
}

/** A real calendar day within a sensible range for a bill, or null. */
function validYmd(y: number, m: number, d: number): Ymd | null {
  if (y < 1990 || y > 2100) return null;
  const day = ymd(y, m, d);
  return isYmd(day) ? day : null;
}
