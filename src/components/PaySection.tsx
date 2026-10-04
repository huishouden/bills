import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import type { Contact, ContactInput } from '@huishouden/pwa-kit/contact-core';
import { ContactDialog, ContactSelect } from '@huishouden/pwa-kit/react/contacts';
import { Checkbox, Chip, Field, inputClass, overline, secondaryButton, selectClass } from '@huishouden/pwa-kit/react/ui';
import { useT } from '../i18n';
import { CONTACT_ROLES, contactRoleLabel } from '../lib/contacts';
import { DEFAULT_BILL_SETTINGS, REMIND_MAX_COUNT, cleanDays, PAY_METHODS, type BillReminder, type BillSettings, type PayFields, type PayMethod } from '../lib/model';
import { methodLabel } from '../lib/pay';
import { daysText } from '../lib/remindText';
import { personName } from './bits';

/** Days offered as chips; any 0-30 is allowed in the data. */
export const DAY_CHOICES = [7, 3, 1, 0] as const;

/** Placeholder for the note, by how it is paid: what the person usually needs to copy. */
const NOTE_KEYS: Partial<Record<PayMethod, 'payDialog.notePlaceholderZelle' | 'payDialog.notePlaceholderVenmo' | 'payDialog.notePlaceholderBank' | 'payDialog.notePlaceholderCheck'>> = {
  zelle: 'payDialog.notePlaceholderZelle',
  venmo: 'payDialog.notePlaceholderVenmo',
  bank: 'payDialog.notePlaceholderBank',
  check: 'payDialog.notePlaceholderCheck',
};

interface Props {
  value: PayFields;
  onChange: (patch: Partial<PayFields>) => void;
  contacts: readonly Contact[];
  /** Members who may pay (admins and members). */
  payers: readonly string[];
  me: string;
  settings: BillSettings | null;
  /** Whether autopay covers it: then the household default never reminds. */
  autopay: boolean;
  onSaveContact: (input: ContactInput) => string;
}

/** Who a bill is paid to and how, who pays it, and its reminders: in the bill and bill source dialogs. */
export function PaySection({ value, onChange, contacts, payers, me, settings, autopay, onSaveContact }: Props) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const s = settings ?? DEFAULT_BILL_SETTINGS;
  const remind = value.remind;
  const mode = !remind ? 'default' : remind.on ? 'on' : 'off';
  const days = cleanDays(remind?.days ?? s.remindDays);
  const overdue = remind?.overdue ?? s.remindOverdue;
  const setRemind = (r: BillReminder | undefined) => onChange({ remind: r });
  const defaultReminds = !autopay && s.remindDefault !== 'none';
  const defaultText = defaultReminds ? t('payDialog.remindDefaultOn', { days: daysText(cleanDays(s.remindDays)) }) : t('payDialog.remindDefaultOff');

  const toggleDay = (d: number) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
    if (next.length > REMIND_MAX_COUNT) return;
    setRemind({ on: true, days: cleanDays(next), overdue });
  };

  return (
    <div className="space-y-4 border-t border-line pt-4">
      <h3 className={overline}>{t('payDialog.howTitle')}</h3>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-soft" htmlFor="pay-to">
          {t('payDialog.payTo')}
        </label>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <ContactSelect id="pay-to" value={value.payeeContactId ?? ''} contacts={contacts} onChange={(id) => onChange({ payeeContactId: id || undefined })} roleLabel={contactRoleLabel} empty={t('payDialog.noPayee')} />
          </div>
          <button type="button" className={secondaryButton} onClick={() => setAdding(true)} aria-label={t('payDialog.newContact')} title={t('payDialog.newContact')}>
            <UserPlus size={18} />
          </button>
        </div>
      </div>
      <div>
        <span className="mb-1.5 block text-sm font-medium text-ink-soft">{t('payDialog.method')}</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('payDialog.method')}>
          {PAY_METHODS.map((m) => (
            <Chip key={m} active={value.payMethod === m} onClick={() => onChange({ payMethod: value.payMethod === m ? undefined : m })}>
              {methodLabel(m)}
            </Chip>
          ))}
        </div>
      </div>
      <Field label={t('payDialog.note')} hint={t('payDialog.noteHint')}>
        <input
          className={inputClass}
          value={value.payNote ?? ''}
          maxLength={200}
          onChange={(e) => onChange({ payNote: e.target.value })}
          placeholder={t(value.payMethod ? (NOTE_KEYS[value.payMethod] ?? 'payDialog.notePlaceholder') : 'payDialog.notePlaceholder')}
        />
      </Field>
      {payers.length > 1 && (
        <Field label={t('payDialog.payer')} hint={t('payDialog.payerHint')}>
          <select className={selectClass} value={value.payer ?? ''} onChange={(e) => onChange({ payer: e.target.value || undefined })}>
            <option value="">{t('payDialog.anyone')}</option>
            {payers.map((p) => (
              <option key={p} value={p}>
                {p === me ? t('payDialog.me') : personName(p, me)}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div>
        <span className="mb-1.5 block text-sm font-medium text-ink-soft">{t('payDialog.reminders')}</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('payDialog.reminders')}>
          <Chip active={mode === 'default'} onClick={() => setRemind(undefined)}>
            {t('payDialog.remindDefault')}
          </Chip>
          <Chip active={mode === 'off'} onClick={() => setRemind({ on: false })}>
            {t('form.off')}
          </Chip>
          <Chip active={mode === 'on'} onClick={() => setRemind({ on: true, days: cleanDays(remind?.days ?? (s.remindDays.length ? s.remindDays : DEFAULT_BILL_SETTINGS.remindDays)), overdue: !autopay && overdue })}>
            {t('form.on')}
          </Chip>
        </div>
        {mode === 'default' && <p className="mt-1 text-sm text-muted">{defaultText}</p>}
        {mode === 'on' && (
          <div className="mt-3 space-y-2 rounded-xl border border-line p-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('payDialog.when')}>
              {DAY_CHOICES.map((d) => (
                <Chip key={d} active={days.includes(d)} onClick={() => toggleDay(d)}>
                  {d === 0 ? t(autopay ? 'payDialog.onDraftDay' : 'payDialog.onDueDay') : t('payDialog.daysBefore', { days: d })}
                </Chip>
              ))}
            </div>
            {!autopay && (
              <Checkbox checked={overdue} onChange={(on) => setRemind({ on: true, days, overdue: on })}>
                {t('payDialog.remindOverdue')}
              </Checkbox>
            )}
            <p className="text-sm text-muted">{t('payDialog.remindAt', { who: value.payer ? (value.payer === me ? t('payDialog.whoMe') : personName(value.payer, me)) : t('payDialog.whoEveryone') })}</p>
          </div>
        )}
      </div>

      {adding && (
        <ContactDialog
          contact={null}
          app="bills"
          roles={CONTACT_ROLES}
          roleLabel={contactRoleLabel}
          role="Landlord"
          namePlaceholder={t('payDialog.contactPlaceholder')}
          onClose={() => setAdding(false)}
          onSave={(input) => onChange({ payeeContactId: onSaveContact(input) })}
        />
      )}
    </div>
  );
}
