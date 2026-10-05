import { CalendarClock, History as HistoryIcon, Mail } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { useClock } from '@huishouden/pwa-kit/react/clock';
import { Header, type Tab } from './components/Header';
import { BillDialog } from './components/BillDialog';
import { FindBillsDialog } from './components/FindBillsDialog';
import { SourceDialog } from './components/SourceDialog';
import { Toast, type ToastState } from '@huishouden/pwa-kit/react/ui';
import { toYmd } from '@huishouden/pwa-kit/time';
import type { Bill, BillSource } from './lib/model';
import { viewBills } from './lib/view';
import { suggestionBill, suggestionLabel, suggestions } from './lib/suggestions';
import type { RecurringCandidate } from '@huishouden/pwa-kit/recurring';
import { useEmailCheck } from './data/useEmailCheck';
import type { BillsStore } from './data/types';
import { History } from './screens/History';
import { Sources } from './screens/Sources';
import { Upcoming } from './screens/Upcoming';
import { useT } from './i18n';
import { BillDetail } from './components/BillDetail';
import { SettingsDialog } from './components/SettingsDialog';
import { payInfo } from './lib/pay';
import { remindPlan, type Plan } from './lib/reminders';
import { DEFAULT_BILL_SETTINGS } from './lib/model';

type TabId = 'upcoming' | 'history' | 'sources';

interface Props {
  store: BillsStore;
  user: User | null;
  onSignIn: () => void;
  onSignOut: () => void;
  signingIn: boolean;
  toast: ToastState | null;
  notify: (message: string, undo?: () => void) => void;
  clearToast: () => void;
  /** Shown above the content: the sample-data banner. */
  banner?: ReactNode;
}

const TABS = [
  { id: 'upcoming', key: 'tabs.upcoming', icon: CalendarClock },
  { id: 'history', key: 'tabs.history', icon: HistoryIcon },
  { id: 'sources', key: 'tabs.sources', icon: Mail },
] as const;

/** Everything inside the frame once there is data to show (live or sample). */
export function BillsApp({ store, user, onSignIn, onSignOut, signingIn, toast, notify, clearToast, banner }: Props) {
  const t = useT();
  const tabs: Tab[] = useMemo(() => TABS.map(({ id, key, icon }) => ({ id, label: t(key), icon })), [t]);
  const { now } = useClock();
  const today = toYmd(now);
  const [tab, setTab] = useState<TabId>('upcoming');
  const [billDialog, setBillDialog] = useState<Bill | 'new' | null>(null);
  const [sourceDialog, setSourceDialog] = useState<BillSource | 'new' | null>(null);
  const [finding, setFinding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // A bill opened from its row or a notification (`?bill=<id>`).
  const [detailId, setDetailId] = useState<string | null>(() => new URLSearchParams(globalThis.location?.search ?? '').get('bill'));
  const email = useEmailCheck(store);
  const views = useMemo(() => viewBills(store.data.bills, today), [store.data.bills, today]);
  const { actions } = store;
  const { charges, bills, sources, answers, contacts } = store.data;
  const settings = store.data.settings[0] ?? null;
  const pay = useCallback((bill: Bill) => payInfo(bill, sources, contacts), [sources, contacts]);
  const plan = useCallback((bill: Bill): Plan | null => remindPlan(bill, pay(bill).remind, settings ?? DEFAULT_BILL_SETTINGS), [pay, settings]);
  const suggested = useMemo(() => suggestions(charges, today, bills, sources, answers), [charges, today, bills, sources, answers]);

  useEffect(() => {
    document.title = t('app.documentTitle');
  }, [t]);

  // A notification's link opens the bill once; the address goes back to the app's own.
  useEffect(() => {
    const url = new URL(location.href);
    if (!url.searchParams.has('bill')) return;
    url.searchParams.delete('bill');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }, []);
  const detail = detailId && store.ready ? views.find((v) => v.bill.id === detailId) : undefined;
  const editSource = (bill: Bill) => {
    const source = sources.find((x) => x.id === bill.sourceId);
    if (source) setSourceDialog(source);
  };

  const find = () => {
    setFinding(true);
    void email.discover();
  };
  const markPaid = (bill: Bill) => notify(t('toast.markedPaid', { name: bill.label }), actions.markPaid(bill));
  const markUnpaid = (bill: Bill) => {
    actions.markUnpaid(bill);
    notify(t('toast.unpaidAgain', { name: bill.label }), () => actions.restoreBill(bill));
  };
  const undoPaid = (bill: Bill) => {
    actions.undoPaid(bill);
    notify(t('toast.unpaidAgain', { name: bill.label }));
  };
  const skip = (bill: Bill) => notify(t('toast.skipped', { name: bill.label }), actions.skipBill(bill));
  const unskip = (bill: Bill) => {
    actions.unskipBill(bill);
    notify(t('toast.backOnList', { name: bill.label }), () => actions.restoreBill(bill));
  };
  const remove = (bill: Bill) => {
    actions.removeBill(bill);
    notify(t('toast.removed', { name: bill.label }), () => actions.restoreBill(bill));
  };

  const addSuggestion = (c: RecurringCandidate) => {
    const input = suggestionBill(c, suggested.all);
    notify(t('toast.added', { name: input.label }), actions.addSuggestion(c, input));
  };
  const dismissSuggestion = (c: RecurringCandidate) => {
    const name = suggestionLabel(c, suggested.all);
    notify(t('toast.wontSuggest', { name }), actions.dismissSuggestion(c, name));
  };

  let content: ReactNode;
  if (!store.ready) content = <p className="p-2 text-lg text-muted">{t('app.loading')}</p>;
  else if (tab === 'history') content = <History views={views} today={today} me={store.me} onMarkUnpaid={markUnpaid} onUnskip={unskip} onRemove={remove} />;
  else if (tab === 'sources')
    content = <Sources store={store} now={now} check={email.state} onCheck={() => void email.check()} onFind={find} onAdd={() => setSourceDialog('new')} onEdit={setSourceDialog} />;
  else
    content = (
      <Upcoming
        store={store}
        views={views}
        today={today}
        now={now}
        check={email.state}
        onCheck={() => void email.check()}
        onFind={find}
        onAdd={() => setBillDialog('new')}
        onEdit={setBillDialog}
        onMarkPaid={markPaid}
        onUndoPaid={undoPaid}
        onSkip={skip}
        onRemove={remove}
        onOpen={(bill) => setDetailId(bill.id)}
        pay={pay}
        plan={plan}
        suggested={suggested}
        onAddSuggestion={addSuggestion}
        onDismissSuggestion={dismissSuggestion}
      />
    );

  return (
    <div className="flex min-h-dvh flex-col bg-page font-sans text-ink antialiased">
      <Header tabs={tabs} tab={tab} onTab={(id) => setTab(id as TabId)} user={user} onSignIn={onSignIn} onSignOut={onSignOut} signingIn={signingIn} onSettings={() => setSettingsOpen(true)} />
      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-4 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 sm:pb-6">
        {banner}
        {content}
      </main>

      {billDialog && (
        <BillDialog
          bill={billDialog === 'new' ? null : billDialog}
          today={today}
          onClose={() => setBillDialog(null)}
          onSave={(input) => {
            actions.saveManualBill(billDialog === 'new' ? null : billDialog.id, input);
            if (billDialog === 'new') notify(t('toast.added', { name: input.label.trim() }));
          }}
          onDelete={billDialog === 'new' ? undefined : () => remove(billDialog)}
          contacts={contacts}
          payers={store.payers}
          me={store.me}
          settings={settings}
          onSaveContact={(input) => actions.saveContact(null, input)}
        />
      )}
      {sourceDialog && (
        <SourceDialog
          source={sourceDialog === 'new' ? null : sourceDialog}
          onClose={() => setSourceDialog(null)}
          onSave={(input) => {
            actions.saveSource(sourceDialog === 'new' ? null : sourceDialog.id, input);
            if (sourceDialog === 'new') notify(t('toast.sourceAdded', { name: input.name.trim() }));
          }}
          onDelete={
            sourceDialog === 'new'
              ? undefined
              : () => notify(t('toast.sourceDeleted', { name: sourceDialog.name }), actions.deleteSource(sourceDialog))
          }
          contacts={contacts}
          payers={store.payers}
          me={store.me}
          settings={settings}
          onSaveContact={(input) => actions.saveContact(null, input)}
        />
      )}
      {finding && (
        <FindBillsDialog
          state={email.discovery}
          today={today}
          onSearch={() => void email.discover()}
          onAdd={(input) => actions.saveSource(null, input)}
          onClose={() => {
            setFinding(false);
            email.resetDiscovery();
          }}
        />
      )}
      {detail && (
        <BillDetail
          view={detail}
          today={today}
          me={store.me}
          info={pay(detail.bill)}
          plan={plan(detail.bill)}
          onClose={() => setDetailId(null)}
          onMarkPaid={markPaid}
          onSkip={skip}
          onEdit={
            detail.bill.source === 'manual'
              ? () => {
                  setDetailId(null);
                  setBillDialog(detail.bill);
                }
              : detail.bill.sourceId && sources.some((x) => x.id === detail.bill.sourceId)
                ? () => {
                    setDetailId(null);
                    editSource(detail.bill);
                  }
                : undefined
          }
          editLabel={detail.bill.source === 'manual' ? undefined : t('detail.editSource')}
        />
      )}
      {settingsOpen && <SettingsDialog settings={settings} live={store.live} onSave={actions.saveSettings} onClose={() => setSettingsOpen(false)} />}
      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}
