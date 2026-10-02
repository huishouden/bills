import { Pencil, Plus, Search } from 'lucide-react';
import { KindIcon } from '../components/bits';
import { EmailStatus } from '../components/EmailStatus';
import { cardClass, iconButton, primaryButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';
import { KIND_LABELS, type BillSource } from '../lib/model';
import type { CheckState } from '../data/useEmailCheck';
import type { BillsStore } from '../data/types';

interface Props {
  store: BillsStore;
  now: number;
  check: CheckState;
  onCheck: () => void;
  onFind: () => void;
  onAdd: () => void;
  onEdit: (source: BillSource) => void;
}

function matchText(s: BillSource): string {
  const parts: string[] = [];
  if (s.from) parts.push(s.from.includes('@') ? `from ${s.from}` : `from any address at ${s.from}`);
  if (s.subject) parts.push(`subject has “${s.subject}”`);
  if (s.label) parts.push(`labelled ${s.label}`);
  return parts.join(', ');
}

/** The household's bill sources: which emails are whose bills. */
export function Sources({ store, now, check, onCheck, onFind, onAdd, onEdit }: Props) {
  const sources = [...store.data.sources].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className={`${cardClass} p-5 sm:p-6`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-2xl font-semibold text-stone-800">Bill sources</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryButton} onClick={onFind}>
              <Search size={18} /> Find bills in my email
            </button>
            <button type="button" className={secondaryButton} onClick={onAdd}>
              <Plus size={18} /> Add a source
            </button>
          </div>
        </div>
        {sources.length === 0 ? (
          <p className="text-lg text-stone-600">No sources yet. Find bills in your email, or add one by its sender.</p>
        ) : (
          <ul className="divide-y divide-stone-200" aria-label="Bill sources">
            {sources.map((s) => (
              <li key={s.id} className="flex items-center gap-4 py-3">
                <KindIcon kind={s.kind} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-semibold text-stone-800">{s.name}</p>
                  <p className="truncate text-sm text-stone-600">
                    {KIND_LABELS[s.kind]} · {matchText(s)}
                    {s.autopay !== null ? ` · autopay ${s.autopay ? 'on' : 'off'}` : ''}
                  </p>
                </div>
                <button type="button" className={iconButton} onClick={() => onEdit(s)} aria-label={`Edit ${s.name}`}>
                  <Pencil size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <aside className={`${cardClass} space-y-3 p-5`}>
        <h2 className="text-lg font-semibold text-stone-800">How email checks work</h2>
        <p className="text-base text-stone-600">
          Each check reads the last 60 days of email from these senders in the Gmail of whoever taps Check email, and fills in amounts, due dates and autopay. Nothing
          else in the mailbox is read or kept.
        </p>
        <EmailStatus syncs={store.data.syncs} state={check} me={store.me} now={now} note={store.mail.note} hasSources={sources.length > 0} onCheck={onCheck} />
      </aside>
    </div>
  );
}
