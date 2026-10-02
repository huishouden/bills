import { useState } from 'react';
import { toDecimal } from '@huishouden/pwa-kit/money';
import { BILL_KINDS, KIND_LABELS, type Bill, type BillKind, type ManualBillInput, type Repeat } from '../lib/model';
import { Chip, Dialog, Field, ghostButton, inputClass, primaryButton } from '@huishouden/pwa-kit/react/ui';

interface Props {
  bill: Bill | null;
  today: string;
  onClose: () => void;
  onSave: (input: ManualBillInput) => void;
  onDelete?: () => void;
}

const REPEATS: [Repeat | null, string][] = [
  [null, 'Once'],
  ['weekly', 'Weekly'],
  ['monthly', 'Monthly'],
  ['quarterly', 'Quarterly'],
  ['yearly', 'Yearly'],
];

/** A bill with no statement email: insurance, tolls, a neighbour's lawn service. */
export function BillDialog({ bill, today, onClose, onSave, onDelete }: Props) {
  const [label, setLabel] = useState(bill?.label ?? '');
  const [kind, setKind] = useState<BillKind>(bill?.kind ?? 'other');
  const [due, setDue] = useState(bill?.due ?? today);
  const [amount, setAmount] = useState(bill?.amountDue?.amount ?? '');
  const [autopay, setAutopay] = useState<boolean | null>(bill?.autopay ? bill.autopay.enrolled : null);
  const [repeat, setRepeat] = useState<Repeat | null>(bill?.repeat ?? null);
  const [payUrl, setPayUrl] = useState(bill?.payUrl ?? '');
  const [problem, setProblem] = useState<string | null>(null);

  const save = () => {
    const money = amount.trim() ? toDecimal(amount) : null;
    if (!label.trim()) return setProblem('Give it a name.');
    if (amount.trim() && money === null) return setProblem('The amount should look like 120.00.');
    if (payUrl.trim() && !payUrl.trim().startsWith('https://')) return setProblem('The pay link must start with https://');
    onSave({ label, kind, due: due || null, amount: money, autopay, repeat, payUrl: payUrl.trim() || undefined });
    onClose();
  };

  return (
    <Dialog
      title={bill ? 'Edit bill' : 'Add a bill'}
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
              Delete
            </button>
          )}
          <button type="button" className={ghostButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primaryButton} onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Car insurance" />
        </Field>
        <Field label="Kind">
          <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as BillKind)}>
            {BILL_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date">
            <input className={inputClass} type="date" value={due ?? ''} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Amount (optional)">
            <input className={`${inputClass} tabular-nums`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </Field>
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-stone-700">Autopay</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Autopay">
            <Chip active={autopay === true} onClick={() => setAutopay(true)}>
              On
            </Chip>
            <Chip active={autopay === false} onClick={() => setAutopay(false)}>
              Off
            </Chip>
            <Chip active={autopay === null} onClick={() => setAutopay(null)}>
              Not sure
            </Chip>
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-stone-700">Repeats</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Repeats">
            {REPEATS.map(([value, text]) => (
              <Chip key={text} active={repeat === value} onClick={() => setRepeat(value)}>
                {text}
              </Chip>
            ))}
          </div>
          {repeat && <span className="mt-1 block text-sm text-stone-600">Marking it paid adds the next one.</span>}
        </div>
        <Field label="Pay link (optional)">
          <input className={inputClass} type="url" value={payUrl} onChange={(e) => setPayUrl(e.target.value)} placeholder="https://" />
        </Field>
        {problem && (
          <p role="alert" className="text-base text-red-700">
            {problem}
          </p>
        )}
      </div>
    </Dialog>
  );
}
