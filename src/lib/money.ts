import type { Money } from './model';

const AMOUNT = /^-?\d+(\.\d+)?$/;

/** "1,234.5", "$1,234.50", "(30.00)", "30.00 CR" or 12.5 → a two-place decimal string; null when not money. */
export function decimal(v: unknown): string | null {
  let s: string;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    s = v.toFixed(2);
  } else if (typeof v === 'string') {
    s = v.trim().replace(/[$,\s]/g, '');
    let negative = false;
    const paren = /^\((.*)\)$/.exec(s);
    if (paren) [s, negative] = [paren[1], true];
    if (/cr$/i.test(s)) [s, negative] = [s.slice(0, -2), true];
    if (negative) s = `-${s.replace(/^-/, '')}`;
  } else return null;
  if (!AMOUNT.test(s)) return null;
  const negative = s.startsWith('-');
  const [whole, frac = ''] = s.replace('-', '').split('.');
  // Integer cents, rounded half up on the third place: no float error.
  let cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  if (frac.length > 2 && Number(frac[2]) >= 5) cents += 1;
  if (!Number.isSafeInteger(cents)) return null;
  if (cents === 0) return '0.00';
  const out = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
  return negative ? `-${out}` : out;
}

export const usd = (amount: string): Money => ({ amount, currency: 'USD' });

const FORMATS = new Map<string, Intl.NumberFormat>();

/** "$1,234.50"; credits as "-$20.00". */
export function formatMoney(m: Money): string {
  let f = FORMATS.get(m.currency);
  if (!f) {
    f = new Intl.NumberFormat('en-US', { style: 'currency', currency: m.currency });
    FORMATS.set(m.currency, f);
  }
  return f.format(Number(m.amount));
}

/** Sum of amounts in one currency, as a two-place string. */
export function sumMoney(list: Money[]): Money | null {
  if (!list.length) return null;
  const currency = list[0].currency;
  const cents = list.filter((m) => m.currency === currency).reduce((n, m) => n + Math.round(Number(m.amount) * 100), 0);
  return { amount: decimal(cents / 100) ?? '0.00', currency };
}
