import { DISCOVERY_PHRASES } from './gmailQuery';
import type { Mailbox, MailMessage } from './emailSync';

/**
 * An invented mailbox for sample mode, answering the same Gmail searches the app sends: enough of
 * Gmail's search language (from:, subject:, label:, newer_than:, the discovery phrases) to behave
 * like the real thing on these messages.
 */

export interface SampleMessage extends MailMessage {
  labels?: string[];
  promotions?: boolean;
}

const at = (ymd: string, hour = 9) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, hour).getTime();
};

export const SAMPLE_MESSAGES: SampleMessage[] = [
  {
    id: 'sample-power-0502',
    date: at('2031-05-02'),
    from: 'Example Power Co <billing@power.example.com>',
    subject: 'Your Example Power Co bill is ready',
    html: '<table><tr><td>Billing period</td><td>Apr 1 &ndash; Apr 30, 2031</td></tr><tr><td>Amount due</td><td>$120.00</td></tr><tr><td>Due date</td><td>May 20, 2031</td></tr></table><p>Sign up for AutoPay and never miss a due date.</p>',
  },
  {
    id: 'sample-water-0420',
    date: at('2031-04-20'),
    from: 'Example Water District <billing@water.example.com>',
    subject: 'Your quarterly water bill',
    text: 'Service period: 01/01/2031 to 03/31/2031\nTotal amount due $90.00\nDue date 05/12/2031',
  },
  {
    id: 'sample-water-0513',
    date: at('2031-05-13', 18),
    from: 'Example Water District <payments@water.example.com>',
    subject: 'Thank you for your payment',
    text: 'We received your payment of $90.00 on May 13, 2031.',
  },
  {
    id: 'sample-fiber-0430',
    date: at('2031-04-30'),
    from: 'Example Fiber <noreply@fiber.example.com>',
    subject: 'Your bill is ready',
    text: 'Amount due: $80.00\nYour AutoPay is scheduled for May 16, 2031. No action is needed.',
  },
  {
    id: 'sample-gas-0508',
    date: at('2031-05-08'),
    from: 'Example Gas Co <billing@gas.example.com>',
    subject: 'Your statement is ready',
    text: 'Total amount due: $40.00\nPlease pay by May 28, 2031.',
  },
  {
    id: 'sample-mobile-0505',
    date: at('2031-05-05'),
    from: 'Example Mobile <no-reply@mobile.example.com>',
    subject: 'Your bill is ready',
    text: 'Your monthly bill of $65.00 is due on May 25, 2031. AutoPay is off for this account.',
  },
  {
    id: 'sample-newsletter',
    date: at('2031-05-10'),
    from: 'Example Deals <deals@shop.example.com>',
    subject: 'Your bill could be lower: pay with points',
    text: 'Save on your bill this month.',
    promotions: true,
  },
];

function tokens(query: string) {
  const from = /from:\(([^)]*)\)/.exec(query)?.[1]?.trim().toLowerCase();
  const subject = /subject:\(([^)]*)\)/.exec(query)?.[1]?.trim().toLowerCase();
  const label = /label:(\S+)/.exec(query)?.[1]?.toLowerCase();
  const days = Number(/newer_than:(\d+)d/.exec(query)?.[1] ?? '0');
  const discovery = query.includes(' OR ');
  return { from, subject, label, days, discovery };
}

function matches(m: SampleMessage, q: ReturnType<typeof tokens>, now: number): boolean {
  if (q.days && m.date < now - q.days * 86_400_000) return false;
  if (m.date > now) return false;
  const sender = m.from.toLowerCase();
  if (q.from && !sender.includes(q.from)) return false;
  if (q.subject && !q.subject.split(/\s+/).every((w) => m.subject.toLowerCase().includes(w))) return false;
  if (q.label && !(m.labels ?? []).some((l) => l.toLowerCase().replace(/[\s/]+/g, '-') === q.label)) return false;
  if (q.discovery) {
    if (m.promotions) return false;
    const text = `${m.subject} ${m.text ?? ''} ${m.html ?? ''}`.toLowerCase();
    if (!DISCOVERY_PHRASES.some((p) => text.includes(p))) return false;
  }
  return true;
}

export function sampleMailbox(clock: () => number, messages: SampleMessage[] = SAMPLE_MESSAGES): Mailbox {
  const byId = new Map(messages.map((m) => [m.id, m]));
  const find = (id: string) => {
    const m = byId.get(id);
    if (!m) throw new Error('No such message');
    return m;
  };
  return {
    async search(query, max) {
      const q = tokens(query);
      return messages
        .filter((m) => matches(m, q, clock()))
        .sort((a, b) => b.date - a.date)
        .slice(0, max)
        .map((m) => m.id);
    },
    async get(id) {
      const { labels: _l, promotions: _p, ...m } = find(id);
      return m;
    },
    async headers(id) {
      const m = find(id);
      return { id: m.id, date: m.date, from: m.from, subject: m.subject };
    },
  };
}
