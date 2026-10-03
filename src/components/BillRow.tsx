import { Check, ExternalLink, Mail, Pencil, RotateCcw, SkipForward, Trash2 } from 'lucide-react';
import { formatMoney } from '@huishouden/pwa-kit/money';
import { dueWords, shortDate } from '@huishouden/pwa-kit/time';
import { KIND_LABELS, type Bill } from '../lib/model';
import { isOpen, type BillView } from '../lib/view';
import { AutopayChip, KindIcon, personName } from './bits';
import { iconButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';

interface Props {
  view: BillView;
  today: string;
  me: string;
  onMarkPaid?: (bill: Bill) => void;
  onMarkUnpaid?: (bill: Bill) => void;
  onSkip?: (bill: Bill) => void;
  onUnskip?: (bill: Bill) => void;
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
  if (state === 'skipped') return `${due}; skipped`;
  return `${due}; replaced by a newer statement`;
}

/** One bill: what, when, how much, whether autopay covers it, and the actions that fit. */
export function BillRow({ view, today, me, onMarkPaid, onMarkUnpaid, onSkip, onUnskip, onEdit, onRemove }: Props) {
  const { bill, state } = view;
  const attention = state === 'overdue' || state === 'attention';
  const open = isOpen(state);
  // Skip is for bills someone has to pay; an email bill can't be deleted, so for those Skip is its Remove.
  const skippable = open && !bill.autopay?.enrolled && !!onSkip;
  const removable = bill.source === 'manual' || (!skippable && state !== 'skipped');
  const period = bill.period ? `${shortDate(bill.period.start, today)} – ${shortDate(bill.period.end, today)}` : null;
  const meta = [KIND_LABELS[bill.kind], period, bill.source === 'manual' ? (bill.repeat ? `Added by hand, repeats ${bill.repeat}` : 'Added by hand') : 'From email'].filter(Boolean).join(' · ');
  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-2 py-3 sm:grid sm:grid-cols-[2.75rem_minmax(0,1fr)_13rem_8rem_10.5rem] lg:grid-cols-[2.75rem_minmax(0,1fr)_13rem_8rem_14.5rem] sm:flex-nowrap rounded-xl px-3 ${attention ? 'bg-attention-tint/40' : ''}`} aria-label={bill.label}>
      <KindIcon kind={bill.kind} attention={attention} />
      <div className="min-w-0 flex-1 basis-48 sm:basis-auto">
        <p className="truncate text-lg font-semibold text-ink">{bill.label}</p>
        <p className="truncate text-sm text-muted">{meta}</p>
      </div>
      <div className="w-full sm:w-auto">
        <p className={`text-base font-medium ${attention ? 'text-attention' : 'text-ink'}`}>{open ? whenText(view, today) : historyText(view, today, me)}</p>
        {open && <AutopayChip autopay={bill.autopay} attention={attention} />}
      </div>
      <p className="flex-1 text-left sm:text-right text-xl font-semibold tabular-nums text-ink">{bill.amountDue ? formatMoney(bill.amountDue) : '—'}</p>
      <div className="flex flex-wrap items-center gap-1">
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
        {skippable && (
          <button type="button" className={iconButton} onClick={() => onSkip!(bill)} aria-label={`Skip ${bill.label}`} title="Skip this one: not paying it here">
            <SkipForward size={18} />
          </button>
        )}
        {state === 'skipped' && onUnskip && (
          <button type="button" className={iconButton} onClick={() => onUnskip(bill)} aria-label={`Put ${bill.label} back`} title="Not skipped after all">
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
        {removable && (
          <button type="button" className={iconButton} onClick={() => onRemove(bill)} aria-label={`Remove ${bill.label}`}>
            <Trash2 size={18} />
          </button>
        )}
      </div>
    </li>
  );
}
