import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { dueWords } from '@huishouden/pwa-kit/time';
import { formatMoney } from '@huishouden/pwa-kit/money';
import { BILL_KINDS, kindLabel, type BillKind, type SourceInput } from '../lib/model';
import { t, useT } from '../i18n';
import type { Proposal } from '../lib/emailSync';
import type { DiscoverState } from '../data/useEmailCheck';
import { Dialog, ErrorNotice, ghostButton, inputClass, primaryButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';

interface Props {
  state: DiscoverState;
  today: string;
  onSearch: () => void;
  onAdd: (input: SourceInput) => void;
  onClose: () => void;
}

function previewText(p: Proposal, today: string): string {
  const v = p.preview;
  if (!v || v.kind !== 'statement') return t('find.latestSubject', { subject: p.latestSubject });
  const parts = [
    v.amountDue ? formatMoney(v.amountDue) : null,
    v.due ? t('find.due', { when: dueWords(v.due, today, { inline: true }) }) : null,
    v.autopay ? (v.autopay.enrolled ? t('find.autopayOn') : t('find.autopayOff')) : null,
  ];
  return t('find.latest', { details: parts.filter(Boolean).join(', ') });
}

function ProposalRow({ p, today, onAdd }: { p: Proposal; today: string; onAdd: (input: SourceInput) => void }) {
  const t = useT();
  const [name, setName] = useState(p.name);
  const [kind, setKind] = useState<BillKind>(p.kind);
  const [wholeDomain, setWholeDomain] = useState(false);
  const [added, setAdded] = useState(false);
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${inputClass} min-w-0 flex-1 basis-40`} value={name} onChange={(e) => setName(e.target.value)} aria-label={t('find.nameFor', { address: p.sender.address })} maxLength={60} disabled={added} />
        <select className={`${inputClass} w-36`} value={kind} onChange={(e) => setKind(e.target.value as BillKind)} aria-label={t('find.kindFor', { address: p.sender.address })} disabled={added}>
          {BILL_KINDS.map((k) => (
            <option key={k} value={k}>
              {kindLabel(k)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={added ? secondaryButton : primaryButton}
          disabled={added || !name.trim()}
          onClick={() => {
            onAdd({ name, kind, from: wholeDomain ? p.sender.domain : p.sender.address, autopay: null });
            setAdded(true);
          }}
        >
          {added ? <Check size={18} /> : <Plus size={18} />} {added ? t('find.added') : t('common.add')}
        </button>
      </div>
      <p className="text-sm text-muted">
        {t('find.emailsFrom', {
          count: p.count,
          from: wholeDomain ? t('find.anyAddressAt', { domain: p.sender.domain }) : p.sender.address,
          preview: previewText(p, today),
        })}
      </p>
      {p.sender.domain && !added && (
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" className="h-5 w-5 accent-forest-700 dark:accent-forest-300" checked={wholeDomain} onChange={(e) => setWholeDomain(e.target.checked)} />
          {t('find.matchDomain', { domain: p.sender.domain })}
        </label>
      )}
    </li>
  );
}

/**
 * Senders of recent statement-like email, for the member to confirm and name. The search starts
 * from the tap that opened this dialog (Google's permission window needs that tap).
 */
export function FindBillsDialog({ state, today, onSearch, onAdd, onClose }: Props) {
  const t = useT();
  return (
    <Dialog
      title={t('find.title')}
      onClose={onClose}
      footer={
        <button type="button" className={ghostButton} onClick={onClose}>
          {t('common.done')}
        </button>
      }
    >
      {(state.status === 'searching' || state.status === 'idle') && <p className="text-base text-muted">{t('find.looking')}</p>}
      {state.status === 'error' && <ErrorNotice message={state.message} onRetry={onSearch} />}
      {state.status === 'done' && state.proposals.length === 0 && (
        <p className="text-base text-muted">{t('find.none')}</p>
      )}
      {state.status === 'done' && state.proposals.length > 0 && (
        <>
          <p className="mb-2 text-base text-muted">{t('find.intro')}</p>
          <ul aria-label={t('find.found')} className="divide-y divide-line">
            {state.proposals.map((p) => (
              <ProposalRow key={p.sender.address} p={p} today={today} onAdd={onAdd} />
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}
