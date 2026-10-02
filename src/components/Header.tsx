import type { User } from 'firebase/auth';
import { AppBar } from '@huishouden/pwa-kit/react/app-bar';
import { PORTAL_URL } from '../lib/portal';

export interface Tab {
  id: string;
  label: string;
}

interface Props {
  tabs: Tab[];
  tab: string;
  onTab: (id: string) => void;
  /** Undefined while the session is being restored: show neither the avatar nor Sign in. */
  user: User | null | undefined;
  onSignIn: () => void;
  onSignOut: () => void;
  signingIn?: boolean;
}

const VERSION = `${import.meta.env.VITE_APP_VERSION} (${import.meta.env.VITE_BUILD_SHA})`;

/** The kit's Huishouden app bar with Bills' sections as its tabs. */
export function Header({ tabs, tab, onTab, user, onSignIn, onSignOut, signingIn }: Props) {
  return (
    <AppBar app="Bills" glyph="card" portalUrl={PORTAL_URL} version={VERSION} user={user} signingIn={signingIn} onSignIn={onSignIn} onSignOut={onSignOut}>
      {tabs.length > 0 && (
        <nav slot="nav" aria-label="Sections" className="flex w-full gap-1 overflow-x-auto rounded-2xl border border-stone-200 bg-white p-1 sm:w-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTab(t.id)}
              aria-current={t.id === tab ? 'page' : undefined}
              className={`min-h-11 flex-1 rounded-xl px-2 text-sm font-medium whitespace-nowrap transition-colors duration-150 sm:flex-none sm:px-5 sm:text-base ${
                t.id === tab ? 'bg-forest-700 text-white' : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      )}
    </AppBar>
  );
}
