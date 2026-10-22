import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LuGlobe, LuHouse, LuLogOut, LuRadar, LuShieldCheck, LuTicket, LuUser } from 'react-icons/lu';
import { LANGS, setLanguage } from '../i18n';
import { useAuth } from '../store/auth';
import { authApi } from '../utils/api';
import { ToastHost, PageSkeleton } from './Overlay';
import { Logo, TopBar } from './ui';
import { SessionExpiredModal } from './states/SessionExpiredState';

const Assistant = lazy(() => import('./Assistant'));

const TABS = [
  { to: '/home', key: 'home', Icon: LuHouse },
  { to: '/trips', key: 'trips', Icon: LuTicket },
  { to: '/track', key: 'track', Icon: LuRadar },
  { to: '/profile', key: 'profile', Icon: LuUser },
] as const;

export function LanguageSelect({ className = '' }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const user = useAuth((s) => s.user);
  return (
    <label className={`relative flex items-center gap-2 rounded-full border-2 border-ink bg-card px-3.5 py-2 text-sm font-bold ${className}`}>
      <LuGlobe size={16} />
      <select aria-label={t('Language')} value={i18n.language} onChange={(e) => { setLanguage(e.target.value); if (user) authApi.updateMe({ language: e.target.value }).catch(() => undefined); }} className="cursor-pointer appearance-none bg-transparent pr-1 outline-none">
        {LANGS.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
      </select>
    </label>
  );
}

/**
 * Responsive shell. Desktop/tablet: sticky top navbar and wide content. Phone: content with a floating
 * bottom tab bar (hidden on the booking steps, which have their own action bar).
 */
export default function Layout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const flow = /^\/(trip\/[^/]+\/(seats|points|passengers)|payment\/)/.test(loc.pathname);
  const [sessionExpired, setSessionExpired] = useState(false);

  const mobileTabs = useMemo(() => {
    if (user && (user.role === 'operator' || user.role === 'admin')) {
      return [...TABS, { to: '/operator', key: 'operator', Icon: LuShieldCheck } as const];
    }
    return TABS;
  }, [user]);

  useEffect(() => {
    const handleExpired = () => setSessionExpired(true);
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, []);

  return (
    <div className="min-h-screen bg-app">
      {/* desktop navbar */}
      <header className="sticky top-0 z-40 hidden border-b-2 border-ink bg-app lg:block">
        <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center justify-between gap-6 px-8">
          <Logo />
          <nav className="flex items-center gap-1.5" aria-label={t('Main')}>
            {TABS.map(({ to, key, Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => `flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-extrabold transition ${isActive ? 'bg-brand text-cream' : 'text-ink hover:bg-ink/5'}`}><Icon size={17} />{t(key)}</NavLink>
            ))}
            {user && (user.role === 'operator' || user.role === 'admin') && <NavLink to="/operator" className={({ isActive }) => `rounded-full px-4 py-2.5 text-sm font-extrabold transition ${isActive ? 'bg-brand text-cream' : 'text-ink hover:bg-ink/5'}`}>{t('Operator')}</NavLink>}
          </nav>
          <div className="flex items-center gap-3">
            <LanguageSelect />
            {user ? (
              <div className="flex items-center gap-2">
                <Link to="/profile" aria-label={t('Profile')} className="grid h-10 w-10 place-items-center rounded-full bg-brand text-sm font-extrabold text-cream">{user.name[0]?.toUpperCase()}</Link>
                <button onClick={async () => { await logout(); nav('/home'); }} aria-label={t('logout')} className="grid h-10 w-10 place-items-center rounded-full border-2 border-ink bg-card transition hover:bg-ink hover:text-cream"><LuLogOut size={16} /></button>
              </div>
            ) : (
              <button onClick={() => nav('/login', { state: { from: loc.pathname + loc.search } })} className="rounded-full bg-brand px-5 py-2.5 text-sm font-extrabold text-cream shadow-cta transition active:scale-95">{t('login')}</button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-28 lg:px-8 lg:pb-14">
        <Suspense fallback={<><TopBar /><PageSkeleton /></>}><div key={loc.pathname} className="page-in"><Outlet /></div></Suspense>
      </main>

      <Suspense fallback={null}>{!flow && <Assistant />}</Suspense>
      <ToastHost />

      {/* Floating pill navigation dock matching reference design (Image 3) */}
      {!flow && (
        <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 pointer-events-none lg:hidden">
          <nav
            className="pointer-events-auto flex items-center justify-between gap-1 rounded-full border border-black/10 bg-white/95 p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.16)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/95"
            style={{ maxWidth: mobileTabs.length > 4 ? '420px' : '360px', width: '100%' }}
            aria-label={t('Main')}
          >
            {mobileTabs.map(({ to, key, Icon }) => (
              <NavLink
                key={to}
                to={to}
                aria-label={key === 'trips' ? t('My Ticket') : key === 'operator' ? t('Operator') : t(key)}
                className={({ isActive }) =>
                  `flex items-center justify-center transition-all duration-300 ease-out select-none ${
                    isActive
                      ? 'gap-2 rounded-full bg-brand px-4 py-2 text-xs font-black text-white shadow-sm'
                      : 'h-10 w-10 rounded-full text-zinc-400 hover:text-ink hover:bg-black/5 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-white/5 active:scale-90'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={isActive ? 18 : 20} strokeWidth={isActive ? 2.5 : 2} className="shrink-0" />
                    {isActive && (
                      <span className="whitespace-nowrap font-black tracking-tight text-white">
                        {key === 'trips' ? t('My Ticket') : key === 'home' ? t('Home') : key === 'track' ? t('Track') : key === 'operator' ? t('Operator') : t('Profile')}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      )}

      <SessionExpiredModal
        isOpen={sessionExpired}
        onClose={() => setSessionExpired(false)}
        savedDraftSummary="Your recent ticket choices, passenger information, and search parameters have been preserved."
      />
    </div>
  );
}
