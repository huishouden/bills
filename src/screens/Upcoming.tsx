import { Plus, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { BillRow } from '../components/BillRow';
import { EmailStatus } from '../components/EmailStatus';
import { CompletionList, cardClass, overline, primaryButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';
import { formatMoney } from '@huishouden/pwa-kit/money';
import type { Bill } from '../lib/model';
import { headline, upcoming, type BillView } from '../lib/view';
import type { CheckState } from '../data/useEmailCheck';
import type { BillsStore } from '../data/types';
import { SubscriptionsLine, SuggestedBills } from '../components/SuggestedBills';
import type { Suggestions } from '../lib/suggestions';
import type { RecurringCandidate } from '@huishouden/pwa-kit/recurring';
import { HORIZON_DAYS } from '../lib/view';
import { useT } from '../i18n';
import type { PayInfo } from '../lib/pay';
import type { Plan } from '../lib/reminders';
import { NotifyPrompt } from '../components/Notifications';

interface Props {
  store: BillsStore;
  views: BillView[];
  today: string;
  now: number;
  check: CheckState;
  onCheck: () => void;
  onFind: () => void;
  onAdd: () => void;
  onEdit: (bill: Bill) => void;
  onMarkPaid: (bill: Bill) => void;
  /** The row's Undo of a payment made here a little while ago. */
  onUndoPaid: (bill: Bill) => void;
  onSkip: (bill: Bill) => void;
  onRemove: (bill: Bill) => void;
  onOpen: (bill: Bill) => void;
  pay: (bill: Bill) => PayInfo;
  plan: (bill: Bill) => Plan | null;
  suggested: Suggestions;
  onAddSuggestion: (c: RecurringCandidate) => void;
  onDismissSuggestion: (c: RecurringCandidate) => void;
}

/** One group: its open bills, then the ones paid here a little while ago; all paid, one line (DESIGN.md "Completion"). */
function Group({ title, open, paid, row }: { title: string; open: BillView[]; paid: BillView[]; row: (v: BillView, done: boolean) => ReactNode }) {
  const t = useT();
  if (!open.length && !paid.length) return null;
  const done = new Set(paid);
  return (
    <section aria-label={title}>
      <h2 className={`${overline} mb-1 px-1`}>{title}</h2>
      <CompletionList items={[...open, ...paid]} isDone={(v) => done.has(v)} label={title} allDone={t('upcoming.allPaid')}>
        {(v) => row(v, done.has(v))}
      </CompletionList>
    </section>
  );
}

/** The next 30 days: overdue first, then this week, then the rest of the month. */
export function Upcoming({ store, views, today, now, check, onCheck, onFind, onAdd, onEdit, onMarkPaid, onUndoPaid, onSkip, onRemove, onOpen, pay, plan, suggested, onAddSuggestion, onDismissSuggestion }: Props) {
  const t = useT();
  const u = upcoming(views, undefined, now);
  const h = headline(u);
  const { sources, syncs } = store.data;
  const row = (v: BillView, done: boolean) => (
    <BillRow
      key={v.bill.id}
      view={v}
      today={today}
      me={store.me}
      done={done}
      onUndoPaid={onUndoPaid}
      onMarkPaid={onMarkPaid}
      onSkip={onSkip}
      onEdit={onEdit}
      onRemove={onRemove}
      onOpen={onOpen}
      pay={pay(v.bill)}
      reminds={!!plan(v.bill)}
    />
  );
  // The first bill that reminds anyone, for the prompt to turn notifications on.
  const reminding = [...u.overdue, ...u.week, ...u.later].find((v) => plan(v.bill));
  const empty = !sources.length && !views.length;

  return (
    <>
      {reminding && <NotifyPrompt live={store.live} billName={reminding.bill.label} />}
      <div className={`${cardClass} p-5 sm:p-6`}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          {/* basis-64: on a phone the headline takes the row and Add a bill wraps below it. */}
          <div className="min-w-0 flex-1 basis-64">
            <h2 className="text-2xl font-semibold text-ink">{h.text}</h2>
            {h.total && <p className="mt-1 text-lg text-muted tabular-nums">{t('upcoming.total', { amount: formatMoney(h.total) })}</p>}
            <SubscriptionsLine {...suggested.subscriptions} />
          </div>
          {!empty && (
            <button type="button" className={secondaryButton} onClick={onAdd}>
              <Plus size={18} /> {t('upcoming.addBill')}
            </button>
          )}
        </div>
        {!empty && (
          <div className="mb-5 rounded-xl border border-line p-3">
            <EmailStatus syncs={syncs} state={check} me={store.me} now={now} note={store.mail.note} hasSources={sources.length > 0} onCheck={onCheck} />
          </div>
        )}
        {empty ? (
          <div className="space-y-3 py-4 text-lg text-muted">
            <p>{t('upcoming.emptyIntro')}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={primaryButton} onClick={onFind}>
                <Search size={18} /> {t('find.title')}
              </button>
              <button type="button" className={secondaryButton} onClick={onAdd}>
                <Plus size={18} /> {t('upcoming.addBill')}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <Group title={t('upcoming.overdue')} open={u.overdue} paid={u.paid.overdue} row={row} />
            <Group title={t('upcoming.week')} open={u.week} paid={u.paid.week} row={row} />
            <Group title={t('upcoming.later')} open={u.later} paid={u.paid.later} row={row} />
            <Group title={t('row.noDueDate')} open={u.noDate} paid={u.paid.noDate} row={row} />
            {!h.count && !u.noDate.length && <p className="text-lg text-muted">{t('upcoming.nothingDue', { days: HORIZON_DAYS })}</p>}
            {u.beyond > 0 && <p className="px-1 text-base text-muted">{t('upcoming.beyond', { count: u.beyond, days: HORIZON_DAYS })}</p>}
          </div>
        )}
      </div>
      <SuggestedBills fresh={suggested.fresh} all={suggested.all} today={today} onAdd={onAddSuggestion} onDismiss={onDismissSuggestion} />
    </>
  );
}
