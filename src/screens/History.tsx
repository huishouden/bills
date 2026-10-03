import { BillRow } from '../components/BillRow';
import { cardClass } from '@huishouden/pwa-kit/react/ui';
import type { Bill } from '../lib/model';
import { history, type BillView } from '../lib/view';

interface Props {
  views: BillView[];
  today: string;
  me: string;
  onMarkUnpaid: (bill: Bill) => void;
  onUnskip: (bill: Bill) => void;
  onRemove: (bill: Bill) => void;
}

/** Paid, drafted, replaced and skipped bills from the last six months. */
export function History({ views, today, me, onMarkUnpaid, onUnskip, onRemove }: Props) {
  const list = history(views, today);
  return (
    <div className={`${cardClass} p-5 sm:p-6`}>
      <h2 className="mb-3 text-2xl font-semibold text-ink">Paid and past bills</h2>
      {list.length === 0 ? (
        <p className="text-lg text-muted">Paid bills show here.</p>
      ) : (
        <ul className="divide-y divide-line" aria-label="Past bills">
          {list.map((v) => (
            <BillRow key={v.bill.id} view={v} today={today} me={me} onMarkUnpaid={onMarkUnpaid} onUnskip={onUnskip} onRemove={onRemove} />
          ))}
        </ul>
      )}
    </div>
  );
}
