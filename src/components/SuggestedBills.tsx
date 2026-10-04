import { CreditCard, Plus } from 'lucide-react';
import { formatCents } from '@huishouden/pwa-kit/money';
import type { RecurringCandidate } from '@huishouden/pwa-kit/recurring';
import { shortDate } from '@huishouden/pwa-kit/time';
import { cardClass, ghostButton, overline, secondaryButton } from '@huishouden/pwa-kit/react/ui';
import { suggestionLabel } from '../lib/suggestions';
import { t, useT } from '../i18n';

interface Props {
  fresh: RecurringCandidate[];
  all: RecurringCandidate[];
  today: string;
  onAdd: (c: RecurringCandidate) => void;
  onDismiss: (c: RecurringCandidate) => void;
}

const money = (amount: number) => formatCents(Math.round(amount * 100));

function detail(c: RecurringCandidate, today: string): string {
  const amount = c.amountVaries ? t('suggested.about', { amount: money(c.typicalAmount) }) : money(c.typicalAmount);
  return t('suggested.detail', { cadence: c.cadence, amount, date: shortDate(c.nextExpected, today), count: c.occurrences });
}

/** Regular charges in the household's card spending that aren't bills here yet. Shown only when there are some. */
export function SuggestedBills({ fresh, all, today, onAdd, onDismiss }: Props) {
  const t = useT();
  if (!fresh.length) return null;
  return (
    <section className={`${cardClass} px-5 py-4 sm:px-6`} aria-label={t('suggested.title')}>
      <h2 className={`${overline} px-1`}>{t('suggested.title')}</h2>
      <p className="mt-1 px-1 text-base text-muted">{t('suggested.intro')}</p>
      <ul className="mt-2 divide-y divide-line">
        {fresh.map((c) => {
          const name = suggestionLabel(c, all);
          return (
            <li key={c.merchantKey} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 py-2.5" aria-label={name}>
              <span aria-hidden="true" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-tint text-link">
                <CreditCard size={22} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate text-lg font-semibold text-ink">{name}</p>
                <p className="text-sm text-muted">{detail(c, today)}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" className={ghostButton} onClick={() => onDismiss(c)} aria-label={t('suggested.notABillLabel', { name })}>
                  {t('suggested.notABill')}
                </button>
                <button type="button" className={secondaryButton} onClick={() => onAdd(c)} aria-label={t('suggested.addLabel', { name })}>
                  <Plus size={18} /> {t('common.add')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** "Subscriptions: $54.97/month across 4": what the household's subscriptions cost per month. */
export function SubscriptionsLine({ count, monthly }: { count: number; monthly: number }) {
  const t = useT();
  if (!count) return null;
  return (
    <p className="mt-1 text-base text-muted tabular-nums">
      {t('suggested.subscriptions', { amount: money(monthly), count })}
    </p>
  );
}
