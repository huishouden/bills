import { useState } from 'react';
import { useT } from '../i18n';
import { BILL_KINDS, kindLabel, sourceProblem, type BillKind, type BillSource, type SourceInput } from '../lib/model';
import { Chip, Dialog, Field, ghostButton, inputClass, primaryButton } from '@huishouden/pwa-kit/react/ui';


/** A link's start, the same in every language. */
const URL_PLACEHOLDER = 'https://';
interface Props {
  source: BillSource | null;
  onClose: () => void;
  onSave: (input: SourceInput) => void;
  onDelete?: () => void;
}

/** Which emails are one provider's bills: a sender, subject words, or a Gmail label. */
export function SourceDialog({ source, onClose, onSave, onDelete }: Props) {
  const t = useT();
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
      title={source ? t('source.titleEdit') : t('source.titleAdd')}
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
        <Field label={t('common.name')} hint={t('source.nameHint')}>
          <input className={inputClass} value={input.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} placeholder={t('source.namePlaceholder')} />
        </Field>
        <Field label={t('form.kind')}>
          <select className={inputClass} value={input.kind} onChange={(e) => set({ kind: e.target.value as BillKind })}>
            {BILL_KINDS.map((k) => (
              <option key={k} value={k}>
                {kindLabel(k)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('source.from')} hint={t('source.fromHint')}>
          <input className={inputClass} value={input.from} onChange={(e) => set({ from: e.target.value })} placeholder={t('source.fromPlaceholder')} />
        </Field>
        <Field label={t('source.subject')}>
          <input className={inputClass} value={input.subject} onChange={(e) => set({ subject: e.target.value })} placeholder={t('source.subjectPlaceholder')} />
        </Field>
        <Field label={t('source.label')}>
          <input className={inputClass} value={input.label} onChange={(e) => set({ label: e.target.value })} placeholder={t('source.labelPlaceholder')} />
        </Field>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink-soft">{t('source.autopay')}</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('form.autopay')}>
            <Chip active={input.autopay === true} onClick={() => set({ autopay: true })}>
              {t('form.on')}
            </Chip>
            <Chip active={input.autopay === false} onClick={() => set({ autopay: false })}>
              {t('form.off')}
            </Chip>
            <Chip active={input.autopay === null} onClick={() => set({ autopay: null })}>
              {t('source.letEmails')}
            </Chip>
          </div>
        </div>
        <Field label={t('form.payLink')}>
          <input className={inputClass} type="url" value={input.payUrl} onChange={(e) => set({ payUrl: e.target.value })} placeholder={URL_PLACEHOLDER} />
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
