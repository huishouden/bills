import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { useEmailCheck } from './data/useEmailCheck';
import type { BillsStore } from './data/types';
import { History } from './screens/History';
import { Sources } from './screens/Sources';
import { Upcoming } from './screens/Upcoming';

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

const TABS: Tab[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'history', label: 'History' },
  { id: 'sources', label: 'Sources' },
];

/** Everything inside the frame once there is data to show (live or sample). */
export function BillsApp({ store, user, onSignIn, onSignOut, signingIn, toast, notify, clearToast, banner }: Props) {
  const { now } = useClock();
  const today = toYmd(now);
  const [tab, setTab] = useState<TabId>('upcoming');
  const [billDialog, setBillDialog] = useState<Bill | 'new' | null>(null);
  const [sourceDialog, setSourceDialog] = useState<BillSource | 'new' | null>(null);
  const [finding, setFinding] = useState(false);
  const email = useEmailCheck(store);
  const views = useMemo(() => viewBills(store.data.bills, today), [store.data.bills, today]);
  const { actions } = store;

  useEffect(() => {
    document.title = 'Huishouden Bills';
  }, []);

  const find = () => {
    setFinding(true);
    void email.discover();
  };
  const markPaid = (bill: Bill) => notify(`Marked ${bill.label} paid`, actions.markPaid(bill));
  const markUnpaid = (bill: Bill) => {
    actions.markUnpaid(bill);
    notify(`${bill.label} is unpaid again`, () => actions.restoreBill(bill));
  };
  const remove = (bill: Bill) => {
    actions.removeBill(bill);
    notify(`Removed ${bill.label}`, () => actions.restoreBill(bill));
  };

  let content: ReactNode;
  if (!store.ready) content = <p className="p-2 text-lg text-stone-600">Loading the household's bills</p>;
  else if (tab === 'history') content = <History views={views} today={today} me={store.me} onMarkUnpaid={markUnpaid} onRemove={remove} />;
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
        onRemove={remove}
      />
    );

  return (
    <div className="flex min-h-dvh flex-col bg-cream font-sans text-stone-800 antialiased">
      <Header tabs={TABS} tab={tab} onTab={(id) => setTab(id as TabId)} user={user} onSignIn={onSignIn} onSignOut={onSignOut} signingIn={signingIn} />
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
            if (billDialog === 'new') notify(`Added ${input.label.trim()}`);
          }}
          onDelete={billDialog === 'new' ? undefined : () => remove(billDialog)}
        />
      )}
      {sourceDialog && (
        <SourceDialog
          source={sourceDialog === 'new' ? null : sourceDialog}
          onClose={() => setSourceDialog(null)}
          onSave={(input) => {
            actions.saveSource(sourceDialog === 'new' ? null : sourceDialog.id, input);
            if (sourceDialog === 'new') notify(`Added ${input.name.trim()}. Check email to read its bills.`);
          }}
          onDelete={
            sourceDialog === 'new'
              ? undefined
              : () => notify(`Deleted ${sourceDialog.name} and its unpaid bills`, actions.deleteSource(sourceDialog))
          }
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
      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}
