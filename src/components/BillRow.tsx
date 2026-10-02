import { Check, ExternalLink, Mail, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { formatMoney } from '@huishouden/pwa-kit/money';
import { dueWords, shortDate } from '@huishouden/pwa-kit/time';
import { KIND_LABELS, type Bill } from '../lib/model';
import type { BillView } from '../lib/view';
import { AutopayChip, KindIcon, personName } from './bits';
import { iconButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';

interface Props {
  view: BillView;
  today: string;
  me: string;
  onMarkPaid?: (bill: Bill) => void;
  onMarkUnpaid?: (bill: Bill) => void;
  onEdit?: (bill: Bill) => void;
  onRemove: (bill: Bill) => void;
}

function whenText(v: BillView, today: string): string {
  const { bill, state, days } = v;
  if (!bill.due) return 'No due date';
  if (state === 'overdue') return days === -1 ? 'Overdue since yesterday' : `Overdue by ${-days!} days`;
  if (state === 'autopay' && bill.autopay?.nextDraft && bill.autopay.nextDraft !== bill.due) return `Due ${dueWords(bill.due, today)}; drafts ${dueWords(bill.autopay.nextDraft, today)}`;
  return `Due ${dueWords(bill.due, today)}`;
}

function historyText(v: BillView, today: string, me: string): string {
  const { bill, state } = v;
  const due = bill.due ? `Due ${shortDate(bill.due, today)}` : 'No due date';
  if (state === 'paid') {
    if (bill.paidVia === 'email') return `${due}; payment email received`;
    return `${due}; marked paid${bill.paidBy ? ` by ${personName(bill.paidBy, me)}` : ''}`;
  }
  if (state === 'credit') return `${due}; credit`;
  if (state === 'autopaid') return `${due}; paid by autopay`;
  return `${due}; replaced by a newer statement`;
}

/** One bill: what, when, how much, whether autopay covers it, and the actions that fit. */
export function BillRow({ view, today, me, onMarkPaid, onMarkUnpaid, onEdit, onRemove }: Props) {
  const { bill, state } = view;
  const attention = state === 'overdue' || state === 'attention';
  const open = ['overdue', 'attention', 'autopay', 'upcoming', 'no-date'].includes(state);
  const period = bill.period ? `${shortDate(bill.period.start, today)} – ${shortDate(bill.period.end, today)}` : null;
  const meta = [KIND_LABELS[bill.kind], period, bill.source === 'manual' ? (bill.repeat ? `Added by hand, repeats ${bill.repeat}` : 'Added by hand') : 'From email'].filter(Boolean).join(' · ');
  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-2 py-3 sm:grid sm:grid-cols-[2.75rem_minmax(0,1fr)_13rem_8rem_10.5rem] sm:flex-nowrap rounded-xl px-3 ${attention ? 'bg-terracotta-light/40' : ''}`} aria-label={bill.label}>
      <KindIcon kind={bill.kind} attention={attention} />
      <div className="min-w-0 flex-1 basis-48 sm:basis-auto">
        <p className="truncate text-lg font-semibold text-stone-800">{bill.label}</p>
        <p className="truncate text-sm text-stone-600">{meta}</p>
      </div>
      <div className="w-full sm:w-auto">
        <p className={`text-base font-medium ${attention ? 'text-terracotta-dark' : 'text-stone-800'}`}>{open ? whenText(view, today) : historyText(view, today, me)}</p>
        {open && <AutopayChip autopay={bill.autopay} attention={attention} />}
      </div>
      <p className="flex-1 text-left sm:text-right text-xl font-semibold tabular-nums text-stone-800">{bill.amountDue ? formatMoney(bill.amountDue) : '—'}</p>
      <div className="flex items-center gap-1">
        {open && onMarkPaid && (
          <button type="button" className={secondaryButton} onClick={() => onMarkPaid(bill)} aria-label={`Mark ${bill.label} paid`}>
            <Check size={18} /> Paid
          </button>
        )}
        {state === 'paid' && bill.paidVia === 'member' && onMarkUnpaid && (
          <button type="button" className={iconButton} onClick={() => onMarkUnpaid(bill)} aria-label={`Mark ${bill.label} not paid`} title="Not paid after all">
            <RotateCcw size={18} />
          </button>
        )}
        {bill.payUrl && open && (
          <a className={iconButton} href={bill.payUrl} target="_blank" rel="noreferrer" aria-label={`Pay ${bill.label} on its site`} title="Pay on the provider's site">
            <ExternalLink size={18} />
          </a>
        )}
        {bill.emailId && !bill.emailId.startsWith('demo-') && !bill.emailId.startsWith('sample-') && (
          <a
            className={iconButton}
            href={`https://mail.google.com/mail/#all/${encodeURIComponent(bill.emailId)}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open the ${bill.label} email in Gmail`}
            title="Open the email in Gmail (the mailbox that checked it)"
          >
            <Mail size={18} />
          </a>
        )}
        {bill.source === 'manual' && onEdit && (
          <button type="button" className={iconButton} onClick={() => onEdit(bill)} aria-label={`Edit ${bill.label}`}>
            <Pencil size={18} />
          </button>
        )}
        <button type="button" className={iconButton} onClick={() => onRemove(bill)} aria-label={`Remove ${bill.label}`}>
          <Trash2 size={18} />
        </button>
      </div>
    </li>
  );
}
