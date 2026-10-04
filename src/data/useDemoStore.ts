import { useMemo } from 'react';
import { useSampleStore } from '@huishouden/pwa-kit/react/store';
import { gmailMailbox } from '@huishouden/pwa-kit/gmail';
import { DEMO_MEMBERS, demoData, type BillsData } from '../lib/demo';
import { sampleMailbox } from '../lib/sampleMailbox';
import { createActions, type Backend, type DataKey } from './actions';
import type { BillsStore, MailAccess } from './types';
import { t } from '../i18n';

/**
 * Sample data kept in memory: the signed-out app is fully clickable, nothing is saved, and a reload
 * starts over. "Check email" reads an invented mailbox (or, in browser tests that set
 * `window.__gmailTestToken`, a stubbed Gmail API).
 */
export function useDemoStore(clock: () => number): BillsStore {
  const { data, read, backend: memory } = useSampleStore<BillsData, DataKey>(demoData);
  const me = DEMO_MEMBERS[0];

  const actions = useMemo(() => {
    const backend: Backend = {
      ...memory,
      writeSync: async (ops) => memory.write(ops),
    };
    return createActions(backend, read, me, clock);
  }, [clock, me, memory, read]);

  const mail = useMemo<MailAccess>(() => {
    const box = () => (typeof window !== 'undefined' && window.__gmailTestToken ? gmailMailbox(window.__gmailTestToken) : sampleMailbox(clock));
    return { stored: box, request: async () => box(), get note() {
        return t('email.noteSample');
      } };
  }, [clock]);

  return { data, ready: true, actions, mail, me, members: DEMO_MEMBERS, payers: DEMO_MEMBERS, clock, sample: true };
}
