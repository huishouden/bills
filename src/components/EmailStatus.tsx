import { RefreshCw } from 'lucide-react';
import { agoWords } from '../lib/dates';
import type { BillSync } from '../lib/model';
import type { CheckState } from '../data/useEmailCheck';
import { personName } from './bits';
import { ErrorNotice, secondaryButton } from './ui';

interface Props {
  syncs: BillSync[];
  state: CheckState;
  me: string;
  now: number;
  note: string;
  hasSources: boolean;
  onCheck: () => void;
}

/** When email was last checked and by whom, and the button that checks it now. */
export function EmailStatus({ syncs, state, me, now, note, hasSources, onCheck }: Props) {
  const latest = [...syncs].sort((a, b) => b.checkedAt - a.checkedAt)[0];
  const mine = syncs.find((s) => s.id === me);
  let line: string;
  if (state.status === 'checking') line = 'Checking email';
  else if (state.status === 'done') line = `Checked just now; ${state.bills === 0 ? 'nothing new' : `${state.bills} bill${state.bills === 1 ? '' : 's'} updated`}`;
  else if (latest) line = `Email checked ${agoWords(latest.checkedAt, now)} by ${personName(latest.by, me)}`;
  else line = 'Email not checked yet';
  const errors = state.status === 'done' ? state.errors : (mine?.errors ?? []);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1 text-base text-stone-600" aria-live="polite">
          {line}
        </p>
        <button type="button" className={secondaryButton} onClick={onCheck} disabled={state.status === 'checking' || !hasSources}>
          <RefreshCw size={18} className={state.status === 'checking' ? 'motion-safe:animate-spin' : ''} /> Check email
        </button>
      </div>
      {!mine && hasSources && <p className="text-sm text-stone-600">{note}</p>}
      {state.status === 'error' && <ErrorNotice message={state.message} onRetry={onCheck} />}
      {errors.length > 0 && state.status !== 'error' && (
        <ul className="list-disc pl-5 text-sm text-terracotta-dark" aria-label="Sources that couldn't be read">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
