import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { useClock } from '@huishouden/pwa-kit/react/clock';
import { AppFrame, AppOpening } from '@huishouden/pwa-kit/react/frame';
import { billsFrame, useBillsTab } from './components/frame';
import { BillDialog } from './components/BillDialog';
import { FindBillsDialog } from './components/FindBillsDialog';
import { SourceDialog } from './components/SourceDialog';
import { Toast, type ToastState } from '@huishouden/pwa-kit/react/ui';
import { useUrlParam } from '@huishouden/pwa-kit/react/url-state';
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

/** Everything inside the frame once there is data to show (live or sample). */
export function BillsApp({ store, user, onSignIn, onSignOut, signingIn, toast, notify, clearToast, banner }: Props) {
  const t = useT();
  const { now } = useClock();
  const today = toYmd(now);
  // The tab and the bill open in detail live in the address, so a reload (an update) and Back return to them.
  const [tab, setTab] = useBillsTab();
  const [billDialog, setBillDialog] = useState<Bill | 'new' | null>(null);
  const [sourceDialog, setSourceDialog] = useState<BillSource | 'new' | null>(null);
  const [finding, setFinding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // A bill opened from its row or a notification (`?bill=<id>`).
  const [detailId, setBillParam] = useUrlParam('bill');
  const setDetailId = (id: string | null) => setBillParam(id, { replace: true });
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

  const detail = detailId && store.ready ? views.find((v) => v.bill.id === detailId) : undefined;
  // A link to a bill that isn't there (paid and gone, removed, not this person's): out of the address.
  const stale = !!detailId && store.ready && !detail;
  useEffect(() => {
    if (stale) setDetailId(null);
  }, [stale]);
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

  const frame = billsFrame(t, { user, onSignIn, onSignOut, signingIn }, { id: tab, choose: (id) => setTab(id) });
  // The first data still on its way: the opening frame, which counts no view yet.
  if (!store.ready) return <AppOpening {...frame} phase="data" />;

  let content: ReactNode;
  if (tab === 'history') content = <History views={views} today={today} me={store.me} onMarkUnpaid={markUnpaid} onUnskip={unskip} onRemove={remove} />;
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

  const dialogs = (
    <>
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
    </>
  );

  return (
    <AppFrame {...frame} onSettings={() => setSettingsOpen(true)} after={dialogs}>
        {banner}
        {content}
    </AppFrame>
  );
}
