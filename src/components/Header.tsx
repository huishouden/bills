import type { User } from 'firebase/auth';
import { AppBar } from '@huishouden/pwa-kit/react/app-bar';
import { SectionTabs, type Tab } from '@huishouden/pwa-kit/react/ui';
import { PORTAL_URL } from '../lib/portal';

export type { Tab } from '@huishouden/pwa-kit/react/ui';

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
      <SectionTabs tabs={tabs} tab={tab} onTab={onTab} />
    </AppBar>
  );
}
