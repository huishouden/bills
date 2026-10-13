import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { signInSilently } from '@huishouden/pwa-kit/auth';
import { markJoined, saveMyProfile, watchHousehold, type HouseholdState } from '@huishouden/pwa-kit/household';
import { refusal } from '@huishouden/pwa-kit/roles';
import { seesMoney } from './lib/access';
import { auth, db, googleClientId, signInWithGoogle, signOutEverywhere } from './data/firebase';
import { useLiveStore } from './data/useLiveStore';
import { useDemoStore } from './data/useDemoStore';
import { DEMO_NOW } from './lib/demo';
import { ClockProvider } from '@huishouden/pwa-kit/react/clock';
import { BillsApp, TAB_IDS, tabsFor, type TabId } from './BillsApp';
import { useUrlTab } from '@huishouden/pwa-kit/react/url-state';
import { Header } from './components/Header';
import { PORTAL_URL } from './lib/portal';
import { cardClass, primaryButton, SampleBanner, useToast, ScreenSkeleton } from '@huishouden/pwa-kit/react/ui';
import { t, useT } from './i18n';

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), []);

  // Signs in without a click when the browser is signed in to Google and has used the app before.
  useEffect(() => {
    if (googleClientId) void signInSilently(auth, googleClientId);
  }, []);

  const signIn = useCallback(async () => {
    setSigningIn(true);
    setSignInError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') setSignInError(t('signIn.failed'));
    } finally {
      setSigningIn(false);
    }
  }, []);
  const signOut = useCallback(() => void signOutEverywhere(), []);

  const frame = { onSignIn: signIn, onSignOut: signOut, signingIn };

  if (user === undefined) return <Opening user={undefined} {...frame} />;
  // `?sample=helper`: what a helper or kid sees when signed in, for screenshots and tests.
  if (user === null && new URLSearchParams(location.search).get('sample') === 'helper') return <MoneyRefusal user={null} {...frame} />;
  if (user === null) return <DemoApp {...frame} signInError={signInError} />;
  return <SignedIn key={user.uid} user={user} {...frame} />;
}

interface FrameProps {
  onSignIn: () => void;
  onSignOut: () => void;
  signingIn: boolean;
}

function SignedIn({ user, ...frame }: FrameProps & { user: User }) {
  const t = useT();
  const email = (user.email ?? '').toLowerCase();
  const [state, setState] = useState<HouseholdState>({ status: 'loading' });
  useEffect(() => (email ? watchHousehold(db, email, setState) : undefined), [email]);
  const household = state.status === 'ready' ? state.household : null;
  useEffect(() => {
    if (household) markJoined(db, household, email).catch(() => {});
  }, [household, email]);
  const householdId = household?.id;
  useEffect(() => {
    if (householdId) saveMyProfile(db, householdId, user).catch(() => {});
  }, [householdId, user]);

  // Helpers and kids never see the household's bills (the rules refuse every read): no listeners, syncs or email checks.
  if (state.status === 'ready' && !seesMoney(state.household, email)) return <MoneyRefusal user={user} {...frame} />;
  if (state.status === 'ready') return <LiveApp householdId={state.household.id} members={state.household.members} payers={state.household.members.filter((m) => seesMoney(state.household, m))} user={user} {...frame} />;
  if (state.status === 'loading') return <Opening user={user} {...frame} label={t('household.finding')} />;
  if (state.status === 'error')
    return (
      <Plain user={user} {...frame}>
        {t('household.unreachable')}
      </Plain>
    );
  return (
    <Plain user={user} {...frame}>
      <h2 className="text-2xl font-semibold text-ink">{t('household.noneTitle')}</h2>
      <p className="mt-2">{t('household.noneBody', { email: user.email ?? '' })}</p>
      <a className={`${primaryButton} mt-5`} href={PORTAL_URL}>
        {t('household.openPortal')}
      </a>
    </Plain>
  );
}

function LiveApp({ householdId, members, payers, user, ...frame }: FrameProps & { householdId: string; members: string[]; payers: string[]; user: User }) {
  const { toast, notify, fail, clear } = useToast();
  const store = useLiveStore(householdId, (user.email ?? '').toLowerCase(), members, payers, fail);
  const read = useCallback(() => Date.now(), []);
  return (
    <ClockProvider read={read}>
      <BillsApp store={store} user={user} {...frame} toast={toast} notify={notify} clearToast={clear} />
    </ClockProvider>
  );
}

/** Signed out: the app with an invented household, so it can be tried and screenshotted. */
function DemoApp({ signInError, ...frame }: FrameProps & { signInError: string | null }) {
  const loadedAt = useMemo(() => Date.now(), []);
  // The sample's clock starts at a fixed moment in 2031 and then runs normally.
  const read = useCallback(() => DEMO_NOW + (Date.now() - loadedAt), [loadedAt]);
  return (
    <ClockProvider read={read}>
      <DemoInner read={read} signInError={signInError} {...frame} />
    </ClockProvider>
  );
}

function DemoInner({ read, signInError, ...frame }: FrameProps & { read: () => number; signInError: string | null }) {
  const t = useT();
  const { toast, notify, clear } = useToast();
  const store = useDemoStore(read);
  const banner = <SampleBanner text={t('sample.banner')} notice={signInError ?? undefined} />;
  return <BillsApp store={store} user={null} {...frame} toast={toast} notify={notify} clearToast={clear} banner={banner} />;
}

function MoneyRefusal({ user, ...frame }: FrameProps & { user: User | null }) {
  const t = useT();
  return (
    <Plain user={user} {...frame}>
      <h2 className="text-2xl font-semibold text-ink">{t('app.name')}</h2>
      <p className="mt-2">{refusal('see-money')}</p>
      <a className={`${primaryButton} mt-5`} href={PORTAL_URL}>
        {t('household.openPortal')}
      </a>
    </Plain>
  );
}

/**
 * While the app opens (the session restoring, the household loading): the app's own frame and tabs
 * over the kit's placeholder, so nothing flashes or jumps before the first screen arrives.
 */
function Opening({ user, label, ...frame }: FrameProps & { user: User | null | undefined; label?: string }) {
  const t = useT();
  const [tab, setTab] = useUrlTab(TAB_IDS, 'upcoming');
  return (
    <div className="flex min-h-dvh flex-col bg-page font-sans text-ink antialiased">
      <Header tabs={tabsFor(t)} tab={tab} onTab={(id) => setTab(id as TabId)} user={user} {...frame} opening />
      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-4 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 sm:pb-6">
        <ScreenSkeleton label={label ?? t('app.loading')} />
      </main>
    </div>
  );
}

function Plain({ user, children, ...frame }: FrameProps & { user: User | null; children?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-page font-sans text-ink antialiased">
      <Header tabs={[]} tab="" onTab={() => {}} user={user} {...frame} />
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6">
        {children && <div className={`${cardClass} max-w-2xl p-6 text-lg text-muted`}>{children}</div>}
      </main>
    </div>
  );
}
