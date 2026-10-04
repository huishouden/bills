import { formatList } from '@huishouden/pwa-kit/i18n';
import { t } from '../i18n';

/** "3 days before and on the due day" (latest first, as stored); "the day after" is said separately. */
export function daysText(days: readonly number[], autopay = false): string {
  if (!days.length) return t('remindText.never');
  return formatList(days.map((d) => (d === 0 ? t(autopay ? 'remindText.draftDay' : 'remindText.dueDay') : t('remindText.daysBefore', { days: d }))));
}

/** A bill's reminders in one line: "3 days before, on the due day and the day after if unpaid, at 9:00". */
export function planText(plan: { days: number[]; overdue: boolean }, autopay = false): string {
  const parts = plan.days.map((d) => (d === 0 ? t(autopay ? 'remindText.draftDay' : 'remindText.dueDay') : t('remindText.daysBefore', { days: d })));
  if (plan.overdue) parts.push(t('remindText.dayAfter'));
  return t('remindText.plan', { when: formatList(parts) });
}
