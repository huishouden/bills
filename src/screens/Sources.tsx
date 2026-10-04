import { Pencil, Plus, Search } from 'lucide-react';
import { KindIcon } from '../components/bits';
import { EmailStatus } from '../components/EmailStatus';
import { cardClass, iconButton, primaryButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';
import { kindLabel, type BillSource } from '../lib/model';
import { compareText } from '@huishouden/pwa-kit/i18n';
import { t, useT } from '../i18n';
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
  if (s.from) parts.push(s.from.includes('@') ? t('sources.from', { from: s.from }) : t('sources.fromDomain', { domain: s.from }));
  if (s.subject) parts.push(t('sources.subject', { subject: s.subject }));
  if (s.label) parts.push(t('sources.label', { label: s.label }));
  return parts.join(', ');
}

/** The household's bill sources: which emails are whose bills. */
export function Sources({ store, now, check, onCheck, onFind, onAdd, onEdit }: Props) {
  const t = useT();
  const sources = [...store.data.sources].sort((a, b) => compareText(a.name, b.name));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <div className={`${cardClass} p-5 sm:p-6`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-2xl font-semibold text-ink">{t('sources.title')}</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryButton} onClick={onFind}>
              <Search size={18} /> {t('find.title')}
            </button>
            <button type="button" className={secondaryButton} onClick={onAdd}>
              <Plus size={18} /> {t('sources.add')}
            </button>
          </div>
        </div>
        {sources.length === 0 ? (
          <p className="text-lg text-muted">{t('sources.empty')}</p>
        ) : (
          <ul className="divide-y divide-line" aria-label={t('sources.title')}>
            {sources.map((s) => (
              <li key={s.id} className="flex items-center gap-4 py-3">
                <KindIcon kind={s.kind} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-semibold text-ink">{s.name}</p>
                  <p className="truncate text-sm text-muted">
                    {[kindLabel(s.kind), matchText(s), s.autopay === null ? '' : s.autopay ? t('find.autopayOn') : t('find.autopayOff')].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button type="button" className={iconButton} onClick={() => onEdit(s)} aria-label={t('row.edit', { name: s.name })}>
                  <Pencil size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <aside className={`${cardClass} space-y-3 p-5`}>
        <h2 className="text-lg font-semibold text-ink">{t('sources.howTitle')}</h2>
        <p className="text-base text-muted">{t('sources.howBody')}</p>
        <EmailStatus syncs={store.data.syncs} state={check} me={store.me} now={now} note={store.mail.note} hasSources={sources.length > 0} onCheck={onCheck} />
      </aside>
    </div>
  );
}
