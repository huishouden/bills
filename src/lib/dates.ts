import type { Ymd } from './model';

export const DAY = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date of an instant. */
export function toYmd(ms: number): Ymd {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight of a calendar date. */
export function ymdToMs(ymd: Ymd): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** Whole days from `from` to `to` (calendar days, so DST changes don't shift the answer). */
export function daysBetween(from: Ymd, to: Ymd): number {
  const a = Date.UTC(...(from.split('-').map(Number) as [number, number, number]));
  const b = Date.UTC(...(to.split('-').map(Number) as [number, number, number]));
  return Math.round((b - a) / DAY);
}

export function addDays(ymd: Ymd, days: number): Ymd {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Same day `months` later, clamped to the month's last day (Jan 31 + 1 month = Feb 28). */
export function addMonths(ymd: Ymd, months: number): Ymd {
  const [y, m, d] = ymd.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`;
}

export function validYmd(y: number, m: number, d: number): Ymd | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'long' });
const MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** "Today", "Tomorrow", "Friday" (this week), "May 30", "Jan 4, 2032". */
export function dueWords(due: Ymd, today: Ymd): string {
  const n = daysBetween(today, due);
  const at = ymdToMs(due);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return WEEKDAY.format(at);
  return due.slice(0, 4) === today.slice(0, 4) ? MONTH_DAY.format(at) : MONTH_DAY_YEAR.format(at);
}

export function shortDate(ymd: Ymd, today: Ymd): string {
  return ymd.slice(0, 4) === today.slice(0, 4) ? MONTH_DAY.format(ymdToMs(ymd)) : MONTH_DAY_YEAR.format(ymdToMs(ymd));
}

/** "just now", "5 minutes ago", "2 hours ago", "3 days ago". */
export function agoWords(ms: number, now: number): string {
  const s = Math.max(0, now - ms);
  if (s < 60_000) return 'just now';
  if (s < 3_600_000) return `${Math.round(s / 60_000)} minute${Math.round(s / 60_000) === 1 ? '' : 's'} ago`;
  if (s < DAY) return `${Math.round(s / 3_600_000)} hour${Math.round(s / 3_600_000) === 1 ? '' : 's'} ago`;
  return `${Math.round(s / DAY)} day${Math.round(s / DAY) === 1 ? '' : 's'} ago`;
}
