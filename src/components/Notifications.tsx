import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { pushEnabled, pushSupport } from '@huishouden/pwa-kit/push';
import { NotificationsCard } from '@huishouden/pwa-kit/react/push';
import { Checkbox, cardClass, iconButton, overline, primaryButton } from '@huishouden/pwa-kit/react/ui';
import { db } from '../data/firebase';
import { useT } from '../i18n';

/** The VAPID key the shared sender signs with; without it the card says notifications aren't set up. */
export const VAPID_PUBLIC_KEY: string = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';

interface Props {
  /** Signed in; the sample shows the card without a working switch. */
  live?: { householdId: string; email: string };
  plain?: boolean;
  /** Offer muting Bills' reminders for this member. */
  mute?: boolean;
}

/**
 * "Notifications on this device": the kit's switch (as Pet and Health have), with Bills' words, and
 * for the signed-in member a "Mute bill reminders for me" that leaves the household's setting alone.
 */
export function DeviceNotifications({ live, plain, mute }: Props) {
  const t = useT();
  const [sampleMuted, setSampleMuted] = useState(false);
  if (live)
    return (
      <NotificationsCard
        db={db}
        householdId={live.householdId}
        user={{ email: live.email }}
        app="bills"
        vapidKey={VAPID_PUBLIC_KEY}
        offText={t('push.offText')}
        onText={t('push.onText')}
        muteText={mute ? t('push.mute') : undefined}
        plain={plain}
      />
    );
  // The sample: what the card looks like, with a note instead of a switch that would do nothing.
  return (
    <section className={plain ? '' : `${cardClass} p-6`} aria-label={t('push.title')}>
      <h3 className={overline}>{t('push.title')}</h3>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-base text-muted">{t('push.offText')}</p>
        <button type="button" className={primaryButton} disabled>
          <Bell size={18} /> {t('push.turnOn')}
        </button>
      </div>
      <p className="mt-2 text-sm text-muted">{t('push.sampleNote')}</p>
      {mute && (
        <div className="mt-3">
          <Checkbox checked={sampleMuted} onChange={setSampleMuted}>
            {t('push.mute')}
          </Checkbox>
          <p className="ml-9 text-sm text-muted">{t('push.muteHint')}</p>
        </div>
      )}
    </section>
  );
}

const DISMISS_KEY = 'bills.notifyPrompt.dismissed';

/**
 * The first time a bill has reminders and this device doesn't show them: a card that says so, with
 * the switch. "Not now" hides it on this device; Settings still has the switch.
 */
export function NotifyPrompt({ live, billName }: { live?: { householdId: string; email: string }; billName: string }) {
  const t = useT();
  const [show, setShow] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [enabled, setEnabled] = useState<boolean | null>(live ? null : false);
  useEffect(() => {
    if (!live) return;
    let on = true;
    pushEnabled(db, live.householdId, { email: live.email })
      .then((v) => on && setEnabled(v))
      .catch(() => on && setEnabled(false));
    return () => {
      on = false;
    };
  }, [live]);
  // A browser that blocked notifications says so in Settings; the prompt would only nag. The
  // sample always shows it, as it would look.
  const support = pushSupport();
  if (!show || enabled !== false || (live && !support.supported && support.reason === 'denied')) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode: hidden until reload */
    }
    setShow(false);
  };
  return (
    <section className={`${cardClass} border-forest-200 p-5 dark:border-forest-500`} aria-label={t('prompt.title')}>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-tint text-link" aria-hidden="true">
          <Bell size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-ink">{t('prompt.title')}</h2>
          <p className="mt-0.5 text-base text-muted">{t('prompt.body', { name: billName })}</p>
        </div>
        <button type="button" className={iconButton} onClick={dismiss} aria-label={t('prompt.notNow')} title={t('prompt.notNow')}>
          <X size={18} />
        </button>
      </div>
      <div className="mt-3">
        <DeviceNotifications live={live} plain />
      </div>
    </section>
  );
}
