import type { BillKind, BillSourceDoc } from './model';

/** How far back an email check looks: two monthly cycles, so a missed check loses nothing. */
export const LOOKBACK_DAYS = 60;

/** Characters that would change the meaning of a Gmail search if a value contained them. */
const unsafe = (s: string) => s.replace(/["(){}]/g, ' ').replace(/\s+/g, ' ').trim();

/** Gmail's search form of a label name: lowercase, spaces and slashes as dashes. */
export function labelToken(label: string): string {
  return unsafe(label).toLowerCase().replace(/[\s/]+/g, '-');
}

/** The Gmail search for one source's emails. */
export function sourceQuery(s: Pick<BillSourceDoc, 'from' | 'subject' | 'label'>, days = LOOKBACK_DAYS): string {
  const parts: string[] = [];
  if (s.from?.trim()) parts.push(`from:(${unsafe(s.from)})`);
  if (s.subject?.trim()) parts.push(`subject:(${unsafe(s.subject)})`);
  if (s.label?.trim()) parts.push(`label:${labelToken(s.label)}`);
  parts.push(`newer_than:${days}d`);
  return parts.join(' ');
}

/** Wording that statement and bill-ready emails share, for "Find bills in my email". */
export const DISCOVERY_PHRASES = [
  'statement is ready',
  'bill is ready',
  'statement is available',
  'amount due',
  'payment due',
  'payment is due',
  'autopay',
  'auto pay',
  'automatic payment',
  'your bill',
  'ebill',
  'e-bill',
  'billing statement',
];

export function discoveryQuery(days = LOOKBACK_DAYS): string {
  return `newer_than:${days}d (${DISCOVERY_PHRASES.map((p) => (p.includes(' ') ? `"${p}"` : p)).join(' OR ')}) -category:promotions -category:social`;
}

export interface Sender {
  name: string;
  address: string;
  domain: string;
}

/** `"Example Power Co" <billing@example.com>` → name, address, domain. */
export function parseSender(from: string): Sender {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  const address = (m ? m[2] : from).trim().toLowerCase();
  const domain = address.includes('@') ? address.slice(address.lastIndexOf('@') + 1) : '';
  return { name: (m ? m[1] : '').trim(), address, domain };
}

const NOISE = /\b(?:no-?reply|do-?not-?reply|billing|bills?|e-?bills?|statements?|notifications?|alerts?|customer (?:service|care)|payments?|accounts?|team|online|services)\b/gi;

/** A display name for a sender: its name without "Billing" or "no-reply", else its domain's main word. */
export function senderName(s: Sender): string {
  const cleaned = s.name.replace(NOISE, ' ').replace(/[|,:-]+\s*$/, '').replace(/\s+/g, ' ').trim();
  if (cleaned.length >= 2) return cleaned.slice(0, 60);
  const labels = s.domain.split('.').filter(Boolean);
  const main = labels.length >= 2 ? labels[labels.length - 2] : labels[0] ?? 'Bill';
  return (main.charAt(0).toUpperCase() + main.slice(1)).slice(0, 60);
}

const KIND_WORDS: [BillKind, RegExp][] = [
  ['mortgage', /\b(?:mortgage|home ?loans?|loan servic\w*|escrow)\b/i],
  ['hoa', /\b(?:hoa|homeowners?|association|community|condo|assessment)\b/i],
  ['insurance', /\b(?:insurance|insurer|mutual|assurance|policy|premium)\b/i],
  ['electric', /\b(?:electric\w*|power|energy|light)\b/i],
  ['gas', /\b(?:gas|propane)\b/i],
  ['water', /\b(?:water|sewer|utilit(?:y|ies)|wastewater)\b/i],
  ['internet', /\b(?:internet|broadband|fiber|fibre|cable|isp|wifi)\b/i],
  ['phone', /\b(?:wireless|mobile|cellular|phone)\b/i],
];

/** A first guess at the kind of bill from the sender and subject; the member confirms it. */
export function guessKind(...texts: string[]): BillKind {
  const text = texts.join(' ');
  for (const [kind, re] of KIND_WORDS) if (re.test(text)) return kind;
  return 'other';
}

/** Whether a source's `from` already covers this sender (an exact address, or its whole domain). */
export function fromCovers(from: string | undefined, sender: Sender): boolean {
  const f = from?.trim().toLowerCase();
  if (!f) return false;
  if (f.includes('@')) return f === sender.address;
  return sender.domain === f || sender.domain.endsWith(`.${f}`);
}
