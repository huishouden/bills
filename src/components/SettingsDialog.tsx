import { useState } from 'react';
import { Checkbox, Chip, Dialog, ghostButton, overline, primaryButton } from '@huishouden/pwa-kit/react/ui';
import { useHome } from '@huishouden/pwa-kit/react/home';
import { useT } from '../i18n';
import { cleanDays, DEFAULT_BILL_SETTINGS, REMIND_MAX_COUNT, type BillSettings, type RemindDefault } from '../lib/model';
import { deviceTimeZone, reminderZone } from '../lib/reminders';
import { DeviceNotifications } from './Notifications';
import { DAY_CHOICES } from './PaySection';

interface Props {
  settings: BillSettings | null;
  live?: { householdId: string; email: string };
  onSave: (settings: Pick<BillSettings, 'remindDefault' | 'remindDays' | 'remindOverdue'> & { timeZone?: string }) => void;
  onClose: () => void;
}

const DEFAULTS: [RemindDefault, 'settings.defaultNone' | 'settings.defaultManual' | 'settings.defaultAll'][] = [
  ['none', 'settings.defaultNone'],
  ['manual', 'settings.defaultManual'],
  ['all', 'settings.defaultAll'],
];

/**
 * Bills settings: this device's notifications (and muting bill reminders for oneself), and the
 * household's reminder default: which bills remind without a setting of their own, and when.
 */
export function SettingsDialog({ settings, live, onSave, onClose }: Props) {
  const t = useT();
  const s = settings ?? DEFAULT_BILL_SETTINGS;
  const [remindDefault, setDefault] = useState<RemindDefault>(s.remindDefault);
  const [days, setDays] = useState<number[]>(cleanDays(s.remindDays));
  const [overdue, setOverdue] = useState(s.remindOverdue);
  const home = useHome();
  const zone = reminderZone(s, home);

  const toggle = (d: number) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
    if (next.length <= REMIND_MAX_COUNT) setDays(cleanDays(next));
  };

  return (
    <Dialog
      title={t('settings.title')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={ghostButton} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className={primaryButton}
            onClick={() => {
              onSave({ remindDefault, remindDays: days, remindOverdue: overdue, timeZone: deviceTimeZone() });
              onClose();
            }}
          >
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <DeviceNotifications live={live} plain mute />
        <section className="space-y-3 border-t border-line pt-4" aria-label={t('settings.householdTitle')}>
          <h3 className={overline}>{t('settings.householdTitle')}</h3>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink-soft">{t('settings.which')}</span>
            <div className="flex flex-col gap-1" role="radiogroup" aria-label={t('settings.which')}>
              {DEFAULTS.map(([value, key]) => (
                <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-1 text-base text-ink">
                  <input type="radio" name="remind-default" className="h-5 w-5 accent-primary" checked={remindDefault === value} onChange={() => setDefault(value)} />
                  {t(key)}
                </label>
              ))}
            </div>
            <p className="mt-1 text-sm text-muted">{t('settings.whichHint')}</p>
          </div>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink-soft">{t('settings.when')}</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('settings.when')}>
              {DAY_CHOICES.map((d) => (
                <Chip key={d} active={days.includes(d)} onClick={() => toggle(d)}>
                  {d === 0 ? t('payDialog.onDueDay') : t('payDialog.daysBefore', { days: d })}
                </Chip>
              ))}
            </div>
            <Checkbox checked={overdue} onChange={setOverdue}>
              {t('payDialog.remindOverdue')}
            </Checkbox>
            <p className="text-sm text-muted">{t('settings.whenHint', { zone })}</p>
          </div>
        </section>
      </div>
    </Dialog>
  );
}
