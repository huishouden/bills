import { useState } from 'react';
import { centsToInput, moneyToCents, parseCents } from '@huishouden/pwa-kit/money';
import { BILL_KINDS, kindLabel, type Bill, type BillKind, type ManualBillInput, type Repeat } from '../lib/model';
import { useT } from '../i18n';
import { Chip, Dialog, Field, ghostButton, inputClass, primaryButton } from '@huishouden/pwa-kit/react/ui';


/** A link's start, the same in every language. */
const URL_PLACEHOLDER = 'https://';
interface Props {
  bill: Bill | null;
  today: string;
  onClose: () => void;
  onSave: (input: ManualBillInput) => void;
  onDelete?: () => void;
}

const REPEATS = [
  [null, 'billDialog.once'],
  ['weekly', 'billDialog.weekly'],
  ['monthly', 'billDialog.monthly'],
  ['quarterly', 'billDialog.quarterly'],
  ['yearly', 'billDialog.yearly'],
] as const satisfies readonly (readonly [Repeat | null, string])[];

/** A bill with no statement email: insurance, tolls, a neighbour's lawn service. */
export function BillDialog({ bill, today, onClose, onSave, onDelete }: Props) {
  const t = useT();
  const [label, setLabel] = useState(bill?.label ?? '');
  const [kind, setKind] = useState<BillKind>(bill?.kind ?? 'other');
  const [due, setDue] = useState(bill?.due ?? today);
  // Typed the reader's way ("120,50" in Spanish and Dutch), stored as a decimal string ("120.50").
  const [amount, setAmount] = useState(bill?.amountDue ? centsToInput(moneyToCents(bill.amountDue)) : '');
  const [autopay, setAutopay] = useState<boolean | null>(bill?.autopay ? bill.autopay.enrolled : null);
  const [repeat, setRepeat] = useState<Repeat | null>(bill?.repeat ?? null);
  const [payUrl, setPayUrl] = useState(bill?.payUrl ?? '');
  const [problem, setProblem] = useState<string | null>(null);

  const save = () => {
    const cents = amount.trim() ? parseCents(amount) : undefined;
    const money = typeof cents === 'number' ? (cents / 100).toFixed(2) : null;
    if (!label.trim()) return setProblem(t('form.noName'));
    if (amount.trim() && money === null) return setProblem(t('billDialog.badAmount', { example: centsToInput(12000) }));
    if (payUrl.trim() && !payUrl.trim().startsWith('https://')) return setProblem(t('form.badLink'));
    onSave({ label, kind, due: due || null, amount: money, autopay, repeat, payUrl: payUrl.trim() || undefined });
    onClose();
  };

  return (
    <Dialog
      title={bill ? t('billDialog.titleEdit') : t('billDialog.titleAdd')}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button
              type="button"
              className={`${ghostButton} mr-auto`}
              onClick={() => {
                onDelete();
                onClose();
              }}
            >
              {t('common.delete')}
            </button>
          )}
          <button type="button" className={ghostButton} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className={primaryButton} onClick={save}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('common.name')}>
          <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder={t('billDialog.namePlaceholder')} />
        </Field>
        <Field label={t('form.kind')}>
          <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as BillKind)}>
            {BILL_KINDS.map((k) => (
              <option key={k} value={k}>
                {kindLabel(k)}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('billDialog.due')}>
            <input className={inputClass} type="date" value={due ?? ''} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label={t('billDialog.amount')}>
            <input className={`${inputClass} tabular-nums`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={centsToInput(0)} />
          </Field>
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink-soft">{t('form.autopay')}</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('form.autopay')}>
            <Chip active={autopay === true} onClick={() => setAutopay(true)}>
              {t('form.on')}
            </Chip>
            <Chip active={autopay === false} onClick={() => setAutopay(false)}>
              {t('form.off')}
            </Chip>
            <Chip active={autopay === null} onClick={() => setAutopay(null)}>
              {t('billDialog.notSure')}
            </Chip>
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink-soft">{t('billDialog.repeats')}</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('billDialog.repeats')}>
            {REPEATS.map(([value, key]) => (
              <Chip key={key} active={repeat === value} onClick={() => setRepeat(value)}>
                {t(key)}
              </Chip>
            ))}
          </div>
          {repeat && <span className="mt-1 block text-sm text-muted">{t('billDialog.repeatHint')}</span>}
        </div>
        <Field label={t('form.payLink')}>
          <input className={inputClass} type="url" value={payUrl} onChange={(e) => setPayUrl(e.target.value)} placeholder={URL_PLACEHOLDER} />
        </Field>
        {problem && (
          <p role="alert" className="text-base text-error">
            {problem}
          </p>
        )}
      </div>
    </Dialog>
  );
}
