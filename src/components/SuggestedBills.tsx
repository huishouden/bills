import { CreditCard, Plus } from 'lucide-react';
import { formatCents } from '@huishouden/pwa-kit/money';
import { CADENCE_LABELS, type RecurringCandidate } from '@huishouden/pwa-kit/recurring';
import { shortDate } from '@huishouden/pwa-kit/time';
import { cardClass, ghostButton, overline, secondaryButton } from '@huishouden/pwa-kit/react/ui';
import { suggestionLabel } from '../lib/suggestions';

interface Props {
  fresh: RecurringCandidate[];
  all: RecurringCandidate[];
  today: string;
  onAdd: (c: RecurringCandidate) => void;
  onDismiss: (c: RecurringCandidate) => void;
}

const money = (amount: number) => formatCents(Math.round(amount * 100));

function detail(c: RecurringCandidate, today: string): string {
  const amount = c.amountVaries ? `about ${money(c.typicalAmount)}` : money(c.typicalAmount);
  return `${CADENCE_LABELS[c.cadence]}, ${amount} · next ${shortDate(c.nextExpected, today)} · ${c.occurrences} charges`;
}

/** Regular charges in the household's card spending that aren't bills here yet. Shown only when there are some. */
export function SuggestedBills({ fresh, all, today, onAdd, onDismiss }: Props) {
  if (!fresh.length) return null;
  return (
    <section className={`${cardClass} px-5 py-4 sm:px-6`} aria-label="Possible regular bills">
      <h2 className={`${overline} px-1`}>Possible regular bills</h2>
      <p className="mt-1 px-1 text-base text-stone-600">Regular charges on the household's cards. Add one to see it with the other bills.</p>
      <ul className="mt-2 divide-y divide-stone-200">
        {fresh.map((c) => {
          const name = suggestionLabel(c, all);
          return (
            <li key={c.merchantKey} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 py-2.5" aria-label={name}>
              <span aria-hidden="true" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-forest-50 text-forest-700">
                <CreditCard size={22} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate text-lg font-semibold text-stone-800">{name}</p>
                <p className="text-sm text-stone-600">{detail(c, today)}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" className={ghostButton} onClick={() => onDismiss(c)} aria-label={`Not a bill: ${name}`}>
                  Not a bill
                </button>
                <button type="button" className={secondaryButton} onClick={() => onAdd(c)} aria-label={`Add ${name}`}>
                  <Plus size={18} /> Add
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
  if (!count) return null;
  return (
    <p className="mt-1 text-base text-stone-600 tabular-nums">
      Subscriptions: {money(monthly)}/month across {count}
    </p>
  );
}
