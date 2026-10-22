import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Gender } from '@busgo/shared';
import i18n from '../i18n';
import { LuArrowRight, LuBus, LuChevronLeft, LuCircleAlert, LuCircleUserRound, LuLock, LuTimer, LuUser, LuUserRound } from 'react-icons/lu';

export function Logo({ className = '', compact }: { className?: string; compact?: boolean }) {
  return (
    <Link to="/home" className={`inline-flex items-center gap-2.5 ${className}`} aria-label="BusGo South home">
      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand text-cream shadow-glow"><LuBus size={20} /></span>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-base font-extrabold tracking-tight">BusGo <span className="text-brand">South</span></span>
          <span className="block text-[11px] font-semibold text-ink-soft">Your journey, our priority</span>
        </span>
      )}
    </Link>
  );
}

/** Top bar for inner screens: back chevron, title, optional right slot. Static on desktop (the navbar is already sticky). */
export function PageHeader({ title, subtitle, right, onBack, to }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode; onBack?: () => void; to?: string }) {
  const nav = useNavigate();
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-30 -mx-4 mb-4 flex items-center gap-3 border-b border-ink/10 bg-app px-4 py-3 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:pt-6">
      <button onClick={onBack ?? (() => (to ? nav(to) : nav(-1)))} aria-label={t('Back')} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-ink bg-card text-ink transition hover:bg-ink hover:text-cream active:scale-90"><LuChevronLeft size={20} /></button>
      <div className="min-w-0 flex-1"><h1 className="truncate text-lg font-extrabold leading-tight lg:text-2xl">{title}</h1>{subtitle && <p className="truncate text-xs font-semibold text-ink-soft lg:text-sm">{subtitle}</p>}</div>
      {right}
    </header>
  );
}

export function Button({ variant = 'primary', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'accent' | 'ghost' | 'danger' | 'glass' }) {
  const v = {
    primary: 'border-2 border-black bg-brand text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px]',
    accent: 'border-2 border-black bg-brand text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px]',
    ghost: 'border-2 border-black bg-white text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] dark:bg-zinc-800 dark:text-white',
    glass: 'border-2 border-black bg-white/95 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px]',
    danger: 'border-2 border-black bg-red-600 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px]',
  }[variant];
  return <button {...p} className={`rounded-xl px-6 py-2.5 text-sm font-extrabold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${v} ${className}`} />;
}

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`rounded-3xl border-2 border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:border-white dark:bg-zinc-900 ${className}`}>{children}</div>
);

export const ErrorText = ({ children }: { children?: ReactNode }) =>
  children ? (
    <p role="alert" aria-live="polite" className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
      <LuCircleAlert size={14} className="shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  ) : null;

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-extrabold uppercase tracking-wide text-ink-soft">
      {label}
      <div className="mt-1.5 text-sm font-normal normal-case tracking-normal">{children}</div>
      <ErrorText>{error}</ErrorText>
    </label>
  );
}

export const inputCls = 'w-full rounded-2xl border-2 border-black bg-card px-4 py-3 text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15 dark:border-white';

const GENDERS: { g: Gender; label: string; Icon: typeof LuUser }[] = [
  { g: 'male', label: 'Male', Icon: LuUser },
  { g: 'female', label: 'Female', Icon: LuUserRound },
  { g: 'other', label: 'Other', Icon: LuCircleUserRound },
];

/** Gender chips. `locked` shows the current value read-only (gender can't be changed once set at signup). */
export function GenderPicker({ value, onChange, locked }: { value?: Gender; onChange?: (g: Gender) => void; locked?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2" role="radiogroup" aria-label={t('Gender')}>
      {GENDERS.map(({ g, label, Icon }) => (
        <button key={g} type="button" role="radio" aria-checked={value === g} disabled={locked && value !== g} onClick={() => !locked && onChange?.(g)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-2xl border-2 px-2 py-2.5 text-sm font-bold transition ${locked ? 'cursor-default' : 'active:scale-95'} ${value === g ? 'border-brand bg-brand text-cream' : 'border-ink/15 bg-card text-ink-soft'} ${locked && value !== g ? 'opacity-40' : ''}`}>
          {locked && value === g ? <LuLock size={14} /> : <Icon size={15} />}{t(label)}
        </button>
      ))}
    </div>
  );
}

/** Seat-hold countdown; calls onExpire once at zero. */
export function Countdown({ to, onExpire, label }: { to: string | null; onExpire?: () => void; label?: string }) {
  const { t } = useTranslation();
  const [left, setLeft] = useState(() => (to ? Math.max(0, new Date(to).getTime() - Date.now()) : 0));
  useEffect(() => {
    if (!to) return;
    let fired = false;
    const tick = () => {
      const ms = Math.max(0, new Date(to).getTime() - Date.now());
      setLeft(ms);
      if (ms === 0 && !fired) { fired = true; onExpire?.(); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);
  if (!to) return null;
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  const urgent = left < 60000;
  return (
    <div className={`flex items-center justify-between rounded-2xl border-2 px-3.5 py-2.5 text-sm font-bold ${urgent ? 'animate-pulse2 border-brand bg-brand text-cream' : 'border-ink bg-card text-ink'}`} role="timer">
      <span className="flex items-center gap-2"><LuTimer size={16} />{label ?? t('Seats held for')}</span>
      <span className="tabular-nums">{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</span>
    </div>
  );
}

/** Thin sliding bar fixed to the top of the screen while a page loads. */
export const TopBar = () => (
  <div className="pointer-events-none fixed inset-x-0 top-0 z-[120] h-1 overflow-hidden bg-brand/15" role="progressbar" aria-label={i18n.t('Loading')}><div className="h-full w-2/5 animate-bar bg-brand" /></div>
);

/** A bus driving along a dashed road, with hopping dots: the app's signature loader. */
export const Spinner = ({ label }: { label?: string }) => (
  <div className="flex flex-col items-center gap-3 py-12" role="status" aria-label={i18n.t('Loading')}>
    <div className="relative h-16 w-52 overflow-hidden rounded-2xl border-2 border-ink bg-card">
      <svg className="absolute inset-x-0 bottom-3 h-1 w-full" aria-hidden><line x1="0" y1="2" x2="100%" y2="2" stroke="#2B0B12" strokeWidth="2" strokeDasharray="12 12" className="animate-dash" /></svg>
      <span className="absolute bottom-4 left-0 grid h-9 w-9 animate-drive place-items-center rounded-xl bg-brand text-cream"><LuBus size={18} /></span>
    </div>
    <div className="flex gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="h-2.5 w-2.5 animate-hop rounded-full bg-brand" style={{ animationDelay: `${i * 140}ms` }} />)}</div>
    {label && <p className="text-sm font-bold text-ink-soft">{label}</p>}
  </div>
);

const PILL: Record<string, string> = {
  booked: 'bg-ink text-cream border-ink',
  cancellation_pending: 'bg-brand text-cream border-brand',
  refund_processing: 'bg-card text-ink border-ink',
  refund_completed: 'bg-surface-tint text-ink border-ink',
  cancelled: 'bg-ink/10 text-ink-soft border-ink/10',
  pending_payment: 'bg-card text-ink border-ink/30',
  expired: 'bg-ink/10 text-ink-soft border-ink/10',
  payment_failed: 'bg-brand text-cream border-brand',
  scheduled: 'bg-surface-tint text-ink border-ink',
};
const STATUS_TEXT: Record<string, string> = {
  booked: 'Booked', cancellation_pending: 'Cancellation pending', refund_processing: 'Refund processing', refund_completed: 'Refund completed',
  cancelled: 'Cancelled', pending_payment: 'Pending payment', expired: 'Expired', payment_failed: 'Payment failed', scheduled: 'Scheduled',
  created: 'Created', success: 'Success', failed: 'Failed', running: 'Running', completed: 'Completed', processing: 'Processing',
};
export const statusText = (status: string) => (STATUS_TEXT[status] ? i18n.t(STATUS_TEXT[status]) : status.replace(/_/g, ' '));
export function StatusPill({ status }: { status: string }) {
  const { t } = useTranslation();
  return <span className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold ${PILL[status] ?? 'border-ink/10 bg-ink/10'}`}>{STATUS_TEXT[status] ? t(STATUS_TEXT[status]) : status.replace(/_/g, ' ')}</span>;
}

/** Round icon tile used in lists and feature rows. */
export const IconTile = ({ children, tone = 'brand' }: { children: ReactNode; tone?: 'brand' | 'ink' | 'cream' }) => {
  const t = { brand: 'bg-brand text-cream', ink: 'bg-ink text-cream', cream: 'bg-surface-tint text-ink border border-ink/20' }[tone];
  return <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${t}`}>{children}</span>;
};

/** Inline arrow used between city names. */
export const Arrow = ({ className = '' }: { className?: string }) => <LuArrowRight className={`mx-1 inline-block align-[-2px] text-brand ${className}`} size={14} />;
