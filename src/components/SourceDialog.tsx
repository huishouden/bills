import { useState } from 'react';
import { BILL_KINDS, KIND_LABELS, sourceProblem, type BillKind, type BillSource, type SourceInput } from '../lib/model';
import { Chip, Dialog, Field, ghostButton, inputClass, primaryButton } from '@huishouden/pwa-kit/react/ui';

interface Props {
  source: BillSource | null;
  onClose: () => void;
  onSave: (input: SourceInput) => void;
  onDelete?: () => void;
}

/** Which emails are one provider's bills: a sender, subject words, or a Gmail label. */
export function SourceDialog({ source, onClose, onSave, onDelete }: Props) {
  const [input, setInput] = useState<SourceInput>({
    name: source?.name ?? '',
    kind: source?.kind ?? 'other',
    from: source?.from ?? '',
    subject: source?.subject ?? '',
    label: source?.label ?? '',
    payUrl: source?.payUrl ?? '',
    autopay: source?.autopay ?? null,
  });
  const [problem, setProblem] = useState<string | null>(null);
  const set = (patch: Partial<SourceInput>) => setInput((i) => ({ ...i, ...patch }));

  const save = () => {
    const p = sourceProblem(input);
    if (p) return setProblem(p);
    onSave(input);
    onClose();
  };

  return (
    <Dialog
      title={source ? 'Edit bill source' : 'Add a bill source'}
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
        <Field label="Name" hint="What the household calls it.">
          <input className={inputClass} value={input.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} placeholder="Electric" />
        </Field>
        <Field label="Kind">
          <select className={inputClass} value={input.kind} onChange={(e) => set({ kind: e.target.value as BillKind })}>
            {BILL_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From" hint="The sender's address, or just its domain for any address there.">
          <input className={inputClass} value={input.from} onChange={(e) => set({ from: e.target.value })} placeholder="billing@example.com or example.com" />
        </Field>
        <Field label="Subject words (optional)">
          <input className={inputClass} value={input.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="statement" />
        </Field>
        <Field label="Gmail label (optional)">
          <input className={inputClass} value={input.label} onChange={(e) => set({ label: e.target.value })} placeholder="Bills" />
        </Field>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink-soft">Autopay, when the emails don't say</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Autopay">
            <Chip active={input.autopay === true} onClick={() => set({ autopay: true })}>
              On
            </Chip>
            <Chip active={input.autopay === false} onClick={() => set({ autopay: false })}>
              Off
            </Chip>
            <Chip active={input.autopay === null} onClick={() => set({ autopay: null })}>
              Let the emails decide
            </Chip>
          </div>
        </div>
        <Field label="Pay link (optional)">
          <input className={inputClass} type="url" value={input.payUrl} onChange={(e) => set({ payUrl: e.target.value })} placeholder="https://" />
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
