import { useCallback, useEffect, useRef, useState } from 'react';
import { discoverSources, syncFromMailbox, type Mailbox, type Proposal } from '../lib/emailSync';
import { gmailError } from './gmail';
import type { BillsStore } from './types';

export type CheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'done'; bills: number; errors: string[] }
  | { status: 'error'; message: string };

export type DiscoverState = { status: 'idle' } | { status: 'searching' } | { status: 'done'; proposals: Proposal[] } | { status: 'error'; message: string };

/**
 * Email checks for one store. `check()` from a tap may ask Google for access; the automatic check
 * when the app opens only uses access granted in the last hour, so it never opens a window.
 */
export function useEmailCheck(store: BillsStore) {
  const [state, setState] = useState<CheckState>({ status: 'idle' });
  const [discovery, setDiscovery] = useState<DiscoverState>({ status: 'idle' });
  const running = useRef(false);
  const storeRef = useRef(store);
  storeRef.current = store;

  const mailbox = async (interactive: boolean): Promise<Mailbox | null> => {
    const { mail } = storeRef.current;
    return mail.stored() ?? (interactive ? await mail.request() : null);
  };

  const check = useCallback(async (interactive = true) => {
    if (running.current) return;
    running.current = true;
    try {
      const box = await mailbox(interactive);
      if (!box) return;
      setState({ status: 'checking' });
      const s = storeRef.current;
      const result = await syncFromMailbox(box, s.data.sources, s.data.bills, s.me, s.clock());
      await s.actions.applySync(result);
      setState({ status: 'done', bills: result.writes.length, errors: result.status.errors });
    } catch (e) {
      setState({ status: 'error', message: gmailError(e) });
    } finally {
      running.current = false;
    }
  }, []);

  const discover = useCallback(async () => {
    setDiscovery({ status: 'searching' });
    try {
      const box = await mailbox(true);
      if (!box) throw new Error('Gmail was not connected.');
      setDiscovery({ status: 'done', proposals: await discoverSources(box, storeRef.current.data.sources) });
    } catch (e) {
      setDiscovery({ status: 'error', message: gmailError(e) });
    }
  }, []);

  // Once per open, when there is something to check and access is still fresh.
  const autoChecked = useRef(false);
  const ready = store.ready && store.data.sources.length > 0;
  useEffect(() => {
    if (!ready || autoChecked.current || typeof window === 'undefined') return;
    autoChecked.current = true;
    // The sample doesn't check on open, so its first screen matches the screenshots.
    if (!store.sample && store.mail.stored()) void check(false);
  }, [ready, store, check]);

  return { state, check, discovery, discover, resetDiscovery: () => setDiscovery({ status: 'idle' }) };
}
