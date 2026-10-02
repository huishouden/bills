import { Plus, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { BillRow } from '../components/BillRow';
import { EmailStatus } from '../components/EmailStatus';
import { cardClass, overline, primaryButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';
import { formatMoney } from '@huishouden/pwa-kit/money';
import type { Bill } from '../lib/model';
import { headline, upcoming, type BillView } from '../lib/view';
import type { CheckState } from '../data/useEmailCheck';
import type { BillsStore } from '../data/types';

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
  onRemove: (bill: Bill) => void;
}

function Group({ title, children, count }: { title: string; children: ReactNode; count: number }) {
  if (!count) return null;
  return (
    <section aria-label={title}>
      <h2 className={`${overline} mb-1 px-1`}>{title}</h2>
      <ul className="divide-y divide-stone-200">{children}</ul>
    </section>
  );
}

/** The next 30 days: overdue first, then this week, then the rest of the month. */
export function Upcoming({ store, views, today, now, check, onCheck, onFind, onAdd, onEdit, onMarkPaid, onRemove }: Props) {
  const u = upcoming(views);
  const h = headline(u);
  const { sources, syncs } = store.data;
  const row = (v: BillView) => <BillRow key={v.bill.id} view={v} today={today} me={store.me} onMarkPaid={onMarkPaid} onEdit={onEdit} onRemove={onRemove} />;
  const empty = !sources.length && !views.length;

  return (
    <div className={`${cardClass} p-5 sm:p-6`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-semibold text-stone-800">{h.text}</h2>
          {h.total && <p className="mt-1 text-lg text-stone-600 tabular-nums">Total {formatMoney(h.total)}</p>}
        </div>
        {!empty && (
          <button type="button" className={secondaryButton} onClick={onAdd}>
            <Plus size={18} /> Add a bill
          </button>
        )}
      </div>
      {!empty && (
        <div className="mb-5 rounded-xl border border-stone-200 p-3">
          <EmailStatus syncs={syncs} state={check} me={store.me} now={now} note={store.mail.note} hasSources={sources.length > 0} onCheck={onCheck} />
        </div>
      )}
      {empty ? (
        <div className="space-y-3 py-4 text-lg text-stone-600">
          <p>Bills reads the statement emails providers send, so each bill's amount, due date and autopay show up here on their own. Bills with no email can be added by hand.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryButton} onClick={onFind}>
              <Search size={18} /> Find bills in my email
            </button>
            <button type="button" className={secondaryButton} onClick={onAdd}>
              <Plus size={18} /> Add a bill
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <Group title="Overdue" count={u.overdue.length}>
            {u.overdue.map(row)}
          </Group>
          <Group title="This week" count={u.week.length}>
            {u.week.map(row)}
          </Group>
          <Group title="Later this month" count={u.later.length}>
            {u.later.map(row)}
          </Group>
          <Group title="No due date" count={u.noDate.length}>
            {u.noDate.map(row)}
          </Group>
          {!h.count && !u.noDate.length && <p className="text-lg text-stone-600">Nothing due in the next 30 days.</p>}
          {u.beyond > 0 && <p className="px-1 text-base text-stone-600">{u.beyond} more due after the next 30 days.</p>}
        </div>
      )}
    </div>
  );
}
