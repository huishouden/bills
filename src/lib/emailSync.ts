import { parseBillEmail, type ParsedBillEmail } from './billEmail';
import { toYmd } from '@huishouden/pwa-kit/time';
import { discoveryQuery, fromCovers, guessKind, parseSender, senderName, sourceQuery, type Sender } from './gmailQuery';
import { clean, type Bill, type BillDoc, type BillKind, type BillSource, type BillSyncDoc } from './model';

/**
 * Turns a member's recent bill emails into bill documents. Pure apart from the mailbox it is
 * handed, so the same code runs against Gmail, the sample mailbox and test fixtures.
 */

/** One email, and Gmail or a stand-in for it: the kit's read-only Gmail shapes. */
export type { MailMessage, Mailbox } from '@huishouden/pwa-kit/gmail';
import type { Mailbox } from '@huishouden/pwa-kit/gmail';

export interface ParsedMessage {
  id: string;
  date: number;
  parsed: ParsedBillEmail;
}

/** At most this many emails per source per check: a monthly bill sends one or two. */
export const MAX_PER_SOURCE = 8;

/** Stable id: the same statement read twice is the same document. */
export function emailBillId(sourceId: string, key: string): string {
  return `${sourceId}_${key}`;
}

export interface EmailBill {
  id: string;
  doc: Omit<BillDoc, 'createdAt' | 'createdBy' | 'updatedAt' | 'observedAt'>;
}

/**
 * The bills one source's emails describe. Each statement is one bill keyed by its due date (or the
 * day it arrived, when it has none); several emails about the same bill merge, newest first. A
 * payment confirmation that arrived after a statement, and before the next one, marks it paid.
 */
export function billsFromMessages(source: BillSource, messages: ParsedMessage[]): EmailBill[] {
  const sorted = [...messages].sort((a, b) => a.date - b.date);
  const statements = sorted.filter((m) => m.parsed.kind === 'statement');
  const payments = sorted.filter((m) => m.parsed.kind === 'payment');
  const byId = new Map<string, EmailBill & { latest: number }>();

  statements.forEach((s, i) => {
    const p = s.parsed;
    const next = statements.slice(i + 1).find((x) => (x.parsed.due ?? toYmd(x.date)) !== (p.due ?? toYmd(s.date)));
    const payment = payments.find((x) => x.date > s.date && (!next || x.date < next.date));
    const autopay = p.autopay ?? payments.find((x) => x.date > s.date && x.parsed.autopay)?.parsed.autopay ?? (source.autopay === null ? null : { enrolled: source.autopay });
    let status: BillDoc['status'] = p.amountDue ? (p.amountDue.amount.startsWith('-') ? 'credit' : p.amountDue.amount === '0.00' ? 'paid' : 'due') : 'due';
    if (payment && status === 'due') status = 'paid';
    const id = emailBillId(source.id, p.due ?? toYmd(s.date));
    const prev = byId.get(id);
    const doc = clean({
      schema: 'bill/v1' as const,
      source: 'email' as const,
      sourceId: source.id,
      kind: source.kind,
      label: source.name,
      due: p.due ?? prev?.doc.due ?? null,
      amountDue: p.amountDue ?? prev?.doc.amountDue ?? null,
      status: prev?.doc.status === 'paid' ? 'paid' : status,
      autopay: autopay ?? prev?.doc.autopay ?? null,
      period: p.period ?? prev?.doc.period ?? undefined,
      payUrl: source.payUrl,
      emailId: s.id,
      paidAt: payment ? payment.date : prev?.doc.paidAt,
      paidVia: payment ? ('email' as const) : prev?.doc.paidVia,
    });
    byId.set(id, { id, doc, latest: s.date });
  });
  return [...byId.values()].map(({ id, doc }) => ({ id, doc }));
}

export interface BillWrite {
  id: string;
  data: BillDoc;
}

const CONTENT_SKIP = new Set(['id', 'createdAt', 'createdBy', 'updatedAt', 'observedAt']);

function contentKey(doc: Partial<BillDoc>): string {
  const keys = Object.keys(doc).filter((k) => !CONTENT_SKIP.has(k) && (doc as Record<string, unknown>)[k] !== undefined).sort();
  return JSON.stringify(keys.map((k) => [k, (doc as Record<string, unknown>)[k]]), (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
  );
}

/**
 * What to write: new statements, and existing ones whose content changed. A member's "Mark paid"
 * and "Remove" (dismissed) survive every later check.
 */
export function planBillWrites(found: EmailBill[], existing: Map<string, Bill>, me: string, now: number): BillWrite[] {
  const writes: BillWrite[] = [];
  for (const { id, doc } of found) {
    const old = existing.get(id);
    const merged: BillDoc = clean({
      ...doc,
      ...(old?.paidVia === 'member' ? { status: 'paid' as const, paidAt: old.paidAt, paidBy: old.paidBy, paidVia: 'member' as const } : {}),
      dismissed: old?.dismissed || undefined,
      createdAt: old?.createdAt ?? now,
      createdBy: old?.createdBy ?? me,
      updatedAt: now,
      observedAt: now,
    }) as BillDoc;
    if (old && contentKey(old) === contentKey(merged)) continue;
    writes.push({ id, data: merged });
  }
  return writes;
}

export interface SyncResult {
  writes: BillWrite[];
  status: BillSyncDoc;
}

/** Reads each source's recent emails and plans the writes. One source failing doesn't stop the rest. */
export async function syncFromMailbox(mailbox: Mailbox, sources: BillSource[], existing: Bill[], me: string, now: number): Promise<SyncResult> {
  const known = new Map(existing.map((b) => [b.id, b]));
  const writes: BillWrite[] = [];
  const errors: string[] = [];
  let emails = 0;
  for (const source of sources) {
    try {
      const ids = await mailbox.search(sourceQuery(source), MAX_PER_SOURCE);
      const messages: ParsedMessage[] = [];
      for (const id of ids) {
        const m = await mailbox.get(id);
        emails += 1;
        messages.push({ id: m.id, date: m.date, parsed: parseBillEmail({ subject: m.subject, text: m.text, html: m.html, date: m.date }) });
      }
      writes.push(...planBillWrites(billsFromMessages(source, messages), known, me, now));
    } catch (e) {
      // Expired access ends the whole check: the member has to allow it again.
      if ((e as { status?: number }).status === 401) throw e;
      errors.push(`${source.name}: ${(e as Error).message}`.slice(0, 200));
    }
  }
  return {
    writes,
    status: { checkedAt: now, by: me, sources: sources.length, emails, bills: writes.length, errors: errors.slice(0, 20) },
  };
}

export interface Proposal {
  sender: Sender;
  name: string;
  kind: BillKind;
  /** Emails from this sender that look like bills. */
  count: number;
  latestSubject: string;
  /** What the newest one says, to help the member decide. */
  preview: ParsedBillEmail | null;
}

/**
 * "Find bills in my email": senders of recent statement-like emails, grouped, minus senders a
 * source already covers. The member confirms, names and sorts each one.
 */
export async function discoverSources(mailbox: Mailbox, sources: BillSource[], max = 60): Promise<Proposal[]> {
  const ids = await mailbox.search(discoveryQuery(), max);
  const groups = new Map<string, { sender: Sender; ids: string[]; latest: number; subject: string }>();
  for (const id of ids) {
    const h = await mailbox.headers(id);
    const sender = parseSender(h.from);
    if (!sender.address || sources.some((s) => fromCovers(s.from, sender))) continue;
    const g = groups.get(sender.address) ?? { sender, ids: [], latest: 0, subject: '' };
    g.ids.push(id);
    if (h.date > g.latest) [g.latest, g.subject] = [h.date, h.subject];
    groups.set(sender.address, g);
  }
  const proposals: Proposal[] = [];
  for (const g of [...groups.values()].sort((a, b) => b.latest - a.latest).slice(0, 15)) {
    let preview: ParsedBillEmail | null = null;
    try {
      const m = await mailbox.get(g.ids[0]);
      preview = parseBillEmail({ subject: m.subject, text: m.text, html: m.html, date: m.date });
    } catch {
      // the list still helps without a preview
    }
    const name = senderName(g.sender);
    proposals.push({ sender: g.sender, name, kind: guessKind(g.sender.name, g.sender.domain, g.subject), count: g.ids.length, latestSubject: g.subject, preview });
  }
  // Senders whose newest email reads as a bill come first.
  return proposals.sort((a, b) => Number(b.preview?.kind === 'statement') - Number(a.preview?.kind === 'statement'));
}
