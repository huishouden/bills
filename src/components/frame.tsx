import { CalendarClock, History as HistoryIcon, Mail } from 'lucide-react';
import type { User } from 'firebase/auth';
import { AppOpening, type AppFrameProps, type OpeningPhase } from '@huishouden/pwa-kit/react/frame';
import { trackView } from '@huishouden/pwa-kit/observability';
import type { Tab } from '@huishouden/pwa-kit/react/ui';
import { useUrlTab } from '@huishouden/pwa-kit/react/url-state';
import { PORTAL_URL } from '../lib/portal';
import { useT } from '../i18n';

export type TabId = 'upcoming' | 'history' | 'sources';

const TABS = [
  { id: 'upcoming', key: 'tabs.upcoming', icon: CalendarClock },
  { id: 'history', key: 'tabs.history', icon: HistoryIcon },
  { id: 'sources', key: 'tabs.sources', icon: Mail },
] as const;

/** The tabs' ids, in order: the address's `?tab=` names one of them. */
export const TAB_IDS: readonly TabId[] = TABS.map((x) => x.id);

/** The app bar's tabs, in the page's language. */
export const tabsFor = (t: ReturnType<typeof useT>): Tab[] => TABS.map(({ id, key, icon }) => ({ id, label: t(key), icon }));

/** The tab on screen, in the address (`?tab=history`), so a reload and Back return to it. */
export const useBillsTab = () => useUrlTab(TAB_IDS, 'upcoming');

/** Who is signed in and the app bar's sign-in controls. `user` is undefined while the session restores. */
export interface Account {
  user: User | null | undefined;
  signingIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

const VERSION = `${import.meta.env.VITE_APP_VERSION} (${import.meta.env.VITE_BUILD_SHA})`;

/**
 * Bills' frame (the kit's `AppFrame`): the same props while the app opens and once it has loaded, so
 * nothing moves between them. Without `tab`, no tabs (a note outside the app's sections).
 */
export function billsFrame(t: ReturnType<typeof useT>, account: Account, tab?: { id: TabId; choose: (id: TabId) => void }): AppFrameProps {
  return {
    app: t('app.name'),
    glyph: 'receipt',
    portalUrl: PORTAL_URL,
    version: VERSION,
    ...account,
    // Counts which tabs are used (anonymous, per visit; see the portal's /privacy page); never while opening.
    onView: trackView,
    layout: 'page',
    ...(tab && { tabs: tabsFor(t), tab: tab.id, onTab: (id: string) => tab.choose(id as TabId) }),
  };
}

/** The app while it opens: the kit's opening frame with Bills' tabs and the one in the address. */
export function BillsOpening({ phase, ...account }: Account & { phase: OpeningPhase }) {
  const t = useT();
  const [tab, setTab] = useBillsTab();
  return <AppOpening {...billsFrame(t, account, { id: tab, choose: setTab })} phase={phase} />;
}
