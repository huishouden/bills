import { Check, ExternalLink, Mail, Pencil, RotateCcw, SkipForward, Trash2 } from 'lucide-react';
import { formatMoney } from '@huishouden/pwa-kit/money';
import { dueWords, shortDate } from '@huishouden/pwa-kit/time';
import { kindLabel, type Bill } from '../lib/model';
import { isOpen, type BillView } from '../lib/view';
import { AutopayChip, KindIcon, personName } from './bits';
import { t, useT } from '../i18n';
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
  if (!bill.due) return t('row.noDueDate');
  if (state === 'overdue') return days === -1 ? t('row.overdueYesterday') : t('row.overdueBy', { days: -days! });
  if (state === 'autopay' && bill.autopay?.nextDraft && bill.autopay.nextDraft !== bill.due)
    return t('row.dueDrafts', { when: dueWords(bill.due, today, { inline: true }), draft: dueWords(bill.autopay.nextDraft, today, { inline: true }) });
  return t('row.due', { when: dueWords(bill.due, today, { inline: true }) });
}

function historyText(v: BillView, today: string, me: string): string {
  const { bill, state } = v;
  const due = bill.due ? t('row.due', { when: shortDate(bill.due, today) }) : t('row.noDueDate');
  if (state === 'paid') {
    if (bill.paidVia === 'email') return t('row.historyPaidEmail', { due });
    return bill.paidBy ? t('row.historyPaidBy', { due, name: personName(bill.paidBy, me) }) : t('row.historyPaid', { due });
  }
  if (state === 'credit') return t('row.historyCredit', { due });
  if (state === 'autopaid') return t('row.historyAutopaid', { due });
  if (state === 'skipped') return t('row.historySkipped', { due });
  return t('row.historySuperseded', { due });
}

/** One bill: what, when, how much, whether autopay covers it, and the actions that fit. */
export function BillRow({ view, today, me, onMarkPaid, onMarkUnpaid, onSkip, onUnskip, onEdit, onRemove }: Props) {
  const t = useT();
  const { bill, state } = view;
  const attention = state === 'overdue' || state === 'attention';
  const open = isOpen(state);
  // Skip is for bills someone has to pay; an email bill can't be deleted, so for those Skip is its Remove.
  const skippable = open && !bill.autopay?.enrolled && !!onSkip;
  const removable = bill.source === 'manual' || (!skippable && state !== 'skipped');
  const period = bill.period ? `${shortDate(bill.period.start, today)} – ${shortDate(bill.period.end, today)}` : null;
  const meta = [kindLabel(bill.kind), period, bill.source === 'manual' ? (bill.repeat ? t('row.addedByHandRepeats', { repeat: bill.repeat }) : t('row.addedByHand')) : t('row.fromEmail')]
    .filter(Boolean)
    .join(' · ');
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
          <button type="button" className={secondaryButton} onClick={() => onMarkPaid(bill)} aria-label={t('row.markPaid', { name: bill.label })}>
            <Check size={18} /> {t('row.paid')}
          </button>
        )}
        {state === 'paid' && bill.paidVia === 'member' && onMarkUnpaid && (
          <button type="button" className={iconButton} onClick={() => onMarkUnpaid(bill)} aria-label={t('row.markUnpaid', { name: bill.label })} title={t('row.notPaidTitle')}>
            <RotateCcw size={18} />
          </button>
        )}
        {skippable && (
          <button type="button" className={iconButton} onClick={() => onSkip!(bill)} aria-label={t('row.skip', { name: bill.label })} title={t('row.skipTitle')}>
            <SkipForward size={18} />
          </button>
        )}
        {state === 'skipped' && onUnskip && (
          <button type="button" className={iconButton} onClick={() => onUnskip(bill)} aria-label={t('row.putBack', { name: bill.label })} title={t('row.notSkippedTitle')}>
            <RotateCcw size={18} />
          </button>
        )}
        {bill.payUrl && open && (
          <a className={iconButton} href={bill.payUrl} target="_blank" rel="noreferrer" aria-label={t('row.pay', { name: bill.label })} title={t('row.payTitle')}>
            <ExternalLink size={18} />
          </a>
        )}
        {bill.emailId && !bill.emailId.startsWith('demo-') && !bill.emailId.startsWith('sample-') && (
          <a
            className={iconButton}
            href={`https://mail.google.com/mail/#all/${encodeURIComponent(bill.emailId)}`}
            target="_blank"
            rel="noreferrer"
            aria-label={t('row.openEmail', { name: bill.label })}
            title={t('row.openEmailTitle')}
          >
            <Mail size={18} />
          </a>
        )}
        {bill.source === 'manual' && onEdit && (
          <button type="button" className={iconButton} onClick={() => onEdit(bill)} aria-label={t('row.edit', { name: bill.label })}>
            <Pencil size={18} />
          </button>
        )}
        {removable && (
          <button type="button" className={iconButton} onClick={() => onRemove(bill)} aria-label={t('row.remove', { name: bill.label })}>
            <Trash2 size={18} />
          </button>
        )}
      </div>
    </li>
  );
}
