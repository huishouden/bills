import { Bell, ExternalLink, Mail, Pencil, RotateCcw, SkipForward, Trash2 } from 'lucide-react';
import { formatMoney } from '@huishouden/pwa-kit/money';
import { clockWords, dueWords, shortDate, toHhmm } from '@huishouden/pwa-kit/time';
import { kindLabel, type Bill } from '../lib/model';
import { isOpen, type BillView } from '../lib/view';
import { AutopayChip, KindIcon, personName } from './bits';
import { t, useT } from '../i18n';
import { CompleteButton, CopyButton, DoneBadge, iconButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';
import { methodLabel, payLine, type PayInfo } from '../lib/pay';
import { AddToCalendar } from '@huishouden/pwa-kit/react/calendar';
import { billCalendarEntry } from '../lib/agenda';

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
  /** Opens the bill's details (how to pay, reminders). */
  onOpen?: (bill: Bill) => void;
  /** Who it is paid to and how. */
  pay?: PayInfo;
  /** Whether it reminds anyone. */
  reminds?: boolean;
  /**
   * Paid here a little while ago (`recentlyPaid`): shown done on Upcoming, after the open bills,
   * with "Paid by You · 8:10 PM" and Undo (DESIGN.md "Completion").
   */
  done?: boolean;
  onUndoPaid?: (bill: Bill) => void;
}

/** A small copy button that fits the row's second line. */
const smallCopy = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-stone-100 dark:hover:bg-forest-700';

export function whenText(v: BillView, today: string): string {
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

/** "Paid by You · 8:10 PM": who marked a bill paid, and when. */
export function paidLine(bill: Bill, me: string): string {
  const at = bill.paidAt ? clockWords(toHhmm(bill.paidAt)) : null;
  if (bill.paidBy && at) return t('row.paidByAt', { name: personName(bill.paidBy, me), at });
  return bill.paidBy ? t('row.paidBy', { name: personName(bill.paidBy, me) }) : t('row.paidDone');
}

/** A bill paid here a little while ago: the done badge, its name muted, who paid it and when, and Undo. */
function PaidRow({ bill, me, onOpen, onUndoPaid }: { bill: Bill; me: string; onOpen?: (bill: Bill) => void; onUndoPaid?: (bill: Bill) => void }) {
  const t = useT();
  return (
    <li
      data-completion="done"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 sm:grid sm:grid-cols-[2.75rem_minmax(0,1fr)_13rem_8rem_10.5rem] lg:grid-cols-[2.75rem_minmax(0,1fr)_13rem_8rem_14.5rem] sm:flex-nowrap rounded-xl px-3"
      aria-label={bill.label}
    >
      <span className="flex w-11 justify-center">
        <DoneBadge />
      </span>
      <div className="min-w-0 flex-1 basis-48 sm:basis-auto">
        {onOpen ? (
          <button type="button" className="block max-w-full truncate text-left text-lg font-semibold text-muted hover:underline" onClick={() => onOpen(bill)} aria-label={t('row.open', { name: bill.label })}>
            {bill.label}
          </button>
        ) : (
          <p className="truncate text-lg font-semibold text-muted">{bill.label}</p>
        )}
        <p className="truncate text-sm text-muted sm:hidden">{paidLine(bill, me)}</p>
      </div>
      <p className="hidden text-base text-muted sm:block">{paidLine(bill, me)}</p>
      <p className="flex-1 text-left sm:text-right text-xl font-semibold tabular-nums text-muted">{bill.amountDue ? formatMoney(bill.amountDue) : '—'}</p>
      <div className="flex flex-wrap items-center gap-1">
        <CompleteButton done name={bill.label} onDone={() => {}} onUndo={onUndoPaid && (() => onUndoPaid(bill))} undoLabel={t('row.undoPaid', { name: bill.label })} />
      </div>
    </li>
  );
}

/** One bill: what, when, how much, whether autopay covers it, and the actions that fit. */
export function BillRow({ view, today, me, onMarkPaid, onMarkUnpaid, onSkip, onUnskip, onEdit, onRemove, onOpen, pay, reminds, done, onUndoPaid }: Props) {
  const t = useT();
  const { bill, state } = view;
  if (done) return <PaidRow bill={bill} me={me} onOpen={onOpen} onUndoPaid={onUndoPaid} />;
  const attention = state === 'overdue' || state === 'attention';
  const open = isOpen(state);
  // Skip is for bills someone has to pay; an email bill can't be deleted, so for those Skip is its Remove.
  const skippable = open && !bill.autopay?.enrolled && !!onSkip;
  const removable = bill.source === 'manual' || (!skippable && state !== 'skipped');
  const calendar = open ? billCalendarEntry(view) : null;
  const how = open && pay ? payLine(pay) : null;
  const note = open ? pay?.payNote : undefined;
  // Its own link, else its bill source's.
  const payUrl = pay?.payUrl ?? bill.payUrl;
  const period = bill.period ? `${shortDate(bill.period.start, today)} – ${shortDate(bill.period.end, today)}` : null;
  const meta = [kindLabel(bill.kind), period, bill.source === 'manual' ? (bill.repeat ? t('row.addedByHandRepeats', { repeat: bill.repeat }) : t('row.addedByHand')) : t('row.fromEmail')]
    .filter(Boolean)
    .join(' · ');
  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-2 py-3 sm:grid sm:grid-cols-[2.75rem_minmax(0,1fr)_13rem_8rem_10.5rem] lg:grid-cols-[2.75rem_minmax(0,1fr)_13rem_8rem_14.5rem] sm:flex-nowrap rounded-xl px-3 ${attention ? 'bg-attention-tint/40' : ''}`} aria-label={bill.label}>
      <KindIcon kind={bill.kind} attention={attention} />
      <div className="min-w-0 flex-1 basis-48 sm:basis-auto">
        {onOpen ? (
          <button type="button" className="block max-w-full truncate text-left text-lg font-semibold text-ink hover:underline" onClick={() => onOpen(bill)} aria-label={t('row.open', { name: bill.label })}>
            {bill.label}
          </button>
        ) : (
          <p className="truncate text-lg font-semibold text-ink">{bill.label}</p>
        )}
        <p className="truncate text-sm text-muted">{meta}</p>
        {(how || note || (open && reminds)) && (
          <div className="flex min-w-0 items-center gap-1.5 text-sm text-ink-soft">
            {open && reminds && <Bell size={14} className="shrink-0 text-link" aria-label={t('row.reminds')} />}
            <span className="min-w-0 truncate">{[how, note].filter(Boolean).join(' · ')}</span>
            {note && <CopyButton text={note} what={pay?.payMethod ? t('detail.noteFor', { method: methodLabel(pay.payMethod) }) : t('detail.note')} className={smallCopy} />}
          </div>
        )}
      </div>
      <div className="w-full sm:w-auto">
        <p className={`text-base font-medium ${attention ? 'text-attention' : 'text-ink'}`}>{open ? whenText(view, today) : historyText(view, today, me)}</p>
        {open && <AutopayChip autopay={bill.autopay} attention={attention} />}
      </div>
      <p className="flex-1 text-left sm:text-right text-xl font-semibold tabular-nums text-ink">{bill.amountDue ? formatMoney(bill.amountDue) : '—'}</p>
      <div className="flex flex-wrap items-center gap-1">
        {calendar && <AddToCalendar entry={calendar} compact />}
        {open && onMarkPaid && (
          <CompleteButton done={false} name={bill.label} verb={t('row.markPaidVerb')} label={t('row.markPaid', { name: bill.label })} onDone={() => onMarkPaid(bill)} />
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
        {payUrl && open && (
          // Paid on a portal, it is the way to pay: a labelled Open; otherwise the link is a shortcut.
          <a className={pay?.payMethod === 'portal' ? secondaryButton : iconButton} href={payUrl} target="_blank" rel="noreferrer" aria-label={t('row.pay', { name: bill.label })} title={t('row.payTitle')}>
            <ExternalLink size={18} />
            {pay?.payMethod === 'portal' && t('row.openPortal')}
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
