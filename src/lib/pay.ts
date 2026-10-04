import type { Contact } from '@huishouden/pwa-kit/contact-core';
import { t } from '../i18n';
import type { Bill, BillSource, PayFields, PayMethod } from './model';

/** Brand names read the same in every language. */
const BRANDS: Partial<Record<PayMethod, string>> = { zelle: 'Zelle', venmo: 'Venmo' };

const METHOD_KEYS = {
  bank: 'pay.bank',
  check: 'pay.check',
  cash: 'pay.cash',
  card: 'pay.card',
  portal: 'pay.portal',
} as const satisfies Record<Exclude<PayMethod, 'zelle' | 'venmo'>, string>;

/** A way to pay in the active language: "Zelle", "Bank transfer", "Cheque". */
export const methodLabel = (m: PayMethod): string => BRANDS[m] ?? t(METHOD_KEYS[m as keyof typeof METHOD_KEYS]);

/** What the pay lines read besides the bill: its bill source and the household's contacts. */
export interface PayContext {
  sources: readonly BillSource[];
  contacts: readonly Contact[];
}

export const NO_PAY: PayContext = { sources: [], contacts: [] };

/** How a bill is paid: its own fields, else its bill source's (an email bill carries none of its own). */
export interface PayInfo extends PayFields {
  payUrl?: string;
  /** The payee, when the contact still exists. */
  payee?: Contact;
}

export function payInfo(bill: Bill, sources: readonly BillSource[], contacts: readonly Contact[]): PayInfo {
  const source = bill.sourceId ? sources.find((s) => s.id === bill.sourceId) : undefined;
  const pick = <K extends keyof PayFields>(k: K): PayFields[K] => bill[k] ?? source?.[k];
  const payeeContactId = pick('payeeContactId');
  return {
    payeeContactId,
    payMethod: pick('payMethod'),
    payNote: pick('payNote'),
    payer: pick('payer'),
    remind: pick('remind'),
    payUrl: bill.payUrl ?? source?.payUrl,
    payee: payeeContactId ? contacts.find((c) => c.id === payeeContactId) : undefined,
  };
}

/** "Zelle to Example Rentals", "Pay Example Rentals", "Zelle"; null when nothing is known. */
export function payLine(info: PayInfo): string | null {
  const name = info.payee?.name;
  if (info.payMethod && name) return t('pay.methodTo', { method: methodLabel(info.payMethod), name });
  if (name) return t('pay.to', { name });
  if (info.payMethod) return methodLabel(info.payMethod);
  return null;
}

/** For the To-do list and the agenda: "Pay Example Rentals by Zelle", "Pay by check", "Pay Example Rentals". */
export function payAction(info: PayInfo): string | null {
  const name = info.payee?.name;
  // Mid-sentence: "by check", but "by Zelle".
  const method = info.payMethod ? (BRANDS[info.payMethod] ?? methodLabel(info.payMethod).toLocaleLowerCase()) : null;
  if (method && name) return t('pay.actionToBy', { name, method });
  if (method) return t('pay.actionBy', { method });
  if (name) return t('pay.actionTo', { name });
  return null;
}
