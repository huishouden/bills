import { Bell, BellOff, Check, ExternalLink, Mail, Pencil, Phone, SkipForward } from 'lucide-react';
import { formatMoney } from '@huishouden/pwa-kit/money';
import { telHref } from '@huishouden/pwa-kit/places';
import { CopyButton, Dialog, ghostButton, linkClass, overline, primaryButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';
import { useT } from '../i18n';
import { contactRoleLabel } from '../lib/contacts';
import { kindLabel, type Bill } from '../lib/model';
import { methodLabel, payLine, type PayInfo } from '../lib/pay';
import { planText } from '../lib/remindText';
import type { Plan } from '../lib/reminders';
import { isOpen, type BillView } from '../lib/view';
import { AutopayChip, KindIcon, personName } from './bits';
import { whenText } from './BillRow';

interface Props {
  view: BillView;
  today: string;
  me: string;
  info: PayInfo;
  /** Its reminders, or null when it has none. */
  plan: Plan | null;
  onClose: () => void;
  onMarkPaid?: (bill: Bill) => void;
  onSkip?: (bill: Bill) => void;
  /** A manual bill's edit, or an email bill's source. */
  onEdit?: () => void;
  editLabel?: string;
}

/**
 * One bill, opened from its row or a notification: when and how much, who it is paid to and how
 * (the Zelle email to copy, the payee's phone and email), its reminders, and Paid.
 */
export function BillDetail({ view, today, me, info, plan, onClose, onMarkPaid, onSkip, onEdit, editLabel }: Props) {
  const t = useT();
  const { bill, state } = view;
  const open = isOpen(state);
  const line = payLine(info);
  const payee = info.payee;
  const autopay = bill.autopay?.enrolled === true;
  return (
    <Dialog
      title={bill.label}
      onClose={onClose}
      footer={
        <>
          {onEdit && (
            <button type="button" className={`${ghostButton} mr-auto`} onClick={onEdit}>
              <Pencil size={18} /> {editLabel ?? t('common.edit')}
            </button>
          )}
          {open && onSkip && !autopay && (
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                onSkip(bill);
                onClose();
              }}
            >
              <SkipForward size={18} /> {t('detail.skip')}
            </button>
          )}
          {open && onMarkPaid && (
            <button
              type="button"
              className={primaryButton}
              onClick={() => {
                onMarkPaid(bill);
                onClose();
              }}
            >
              <Check size={18} /> {t('detail.markPaid')}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <KindIcon kind={bill.kind} attention={state === 'overdue' || state === 'attention'} />
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-semibold tabular-nums text-ink">{bill.amountDue ? formatMoney(bill.amountDue) : '—'}</p>
            <p className="text-base text-muted">{open ? whenText(view, today) : kindLabel(bill.kind)}</p>
          </div>
          {open && <AutopayChip autopay={bill.autopay} attention={state === 'overdue' || state === 'attention'} />}
        </div>

        {(line || info.payNote || info.payUrl) && (
          <section aria-label={t('detail.howToPay')}>
            <h3 className={overline}>{t('detail.howToPay')}</h3>
            {line && <p className="mt-1 text-lg font-semibold text-ink">{line}</p>}
            {info.payNote && (
              <div className="mt-1 flex items-center gap-1">
                <p className="min-w-0 flex-1 text-lg text-ink [overflow-wrap:anywhere]">{info.payNote}</p>
                <CopyButton text={info.payNote} what={info.payMethod ? t('detail.noteFor', { method: methodLabel(info.payMethod) }) : t('detail.note')} />
              </div>
            )}
            {info.payUrl && (
              <a className={linkClass} href={info.payUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={18} aria-hidden="true" /> {t('detail.openPortal')}
              </a>
            )}
          </section>
        )}

        {payee && (
          <section aria-label={t('detail.payee')}>
            <h3 className={overline}>{payee.role ? contactRoleLabel(payee.role) : t('detail.payee')}</h3>
            <p className="mt-1 text-lg font-semibold text-ink">{payee.name}</p>
            {payee.phone && (
              <div className="flex items-center gap-1">
                <a className={`${linkClass} tabular-nums`} href={telHref(payee.phone)}>
                  <Phone size={18} aria-hidden="true" /> {payee.phone}
                </a>
                <CopyButton text={payee.phone} what={t('detail.phoneOf', { name: payee.name })} />
              </div>
            )}
            {payee.email && (
              <div className="flex items-center gap-1">
                <a className={`${linkClass} [overflow-wrap:anywhere]`} href={`mailto:${payee.email}`}>
                  <Mail size={18} aria-hidden="true" /> {payee.email}
                </a>
                <CopyButton text={payee.email} what={t('detail.emailOf', { name: payee.name })} />
              </div>
            )}
          </section>
        )}

        {open && (
          <section aria-label={t('detail.reminders')}>
            <h3 className={overline}>{t('detail.reminders')}</h3>
            <p className="mt-1 flex items-start gap-2 text-base text-ink-soft">
              {plan ? <Bell size={18} className="mt-0.5 shrink-0 text-link" aria-hidden="true" /> : <BellOff size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />}
              <span>
                {plan
                  ? t('detail.remindsWho', { when: planText(plan, autopay), who: info.payer ? (info.payer === me ? t('payDialog.whoMe') : personName(info.payer, me)) : t('payDialog.whoEveryone') })
                  : t('detail.noReminders')}
              </span>
            </p>
          </section>
        )}
      </div>
    </Dialog>
  );
}
