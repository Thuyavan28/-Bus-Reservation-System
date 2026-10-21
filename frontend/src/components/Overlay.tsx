import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LuBus, LuCircleCheck, LuInfo, LuTriangleAlert, LuX } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { useUI } from '../store/ui';

const ICON = { success: LuCircleCheck, error: LuTriangleAlert, info: LuInfo } as const;
const TONE = { success: 'bg-surface-tint text-ink border-ink', error: 'bg-brand text-cream border-brand', info: 'bg-card text-ink border-ink' } as const;

/** Popup notifications, centred at the top of every screen. */
export function ToastHost() {
  const { toasts, dismiss } = useUI();
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICON[t.kind];
        return (
          <button key={t.id} onClick={() => dismiss(t.id)} className={`pointer-events-auto flex w-full max-w-md animate-pop items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-sm font-bold shadow-lift ${TONE[t.kind]}`}>
            <Icon size={18} className="shrink-0" /><span className="flex-1">{t.text}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

/** Centered dialog on all screen sizes (was bottom-sheet on phones). */
export function Modal({ open, onClose, title, children, dismissible = true }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; dismissible?: boolean; wide?: boolean }) {
  // stay mounted for the exit animation
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) { setMounted(true); setClosing(false); return; }
    if (!mounted) return;
    setClosing(true);
    const t = setTimeout(() => { setMounted(false); setClosing(false); }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && dismissible && onClose();
    document.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [open, onClose, dismissible]);
  if (!mounted) return null;
  return createPortal(
    <div
      className={`fixed inset-0 z-[90] flex items-center justify-center p-4 ${closing ? 'animate-fadeOut' : 'animate-fade'} bg-ink/55 backdrop-blur-[2px]`}
      onMouseDown={(e) => e.target === e.currentTarget && dismissible && onClose()}
      role="dialog" aria-modal="true" aria-label={title}
    >
      <div className={`max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[2rem] border-2 border-ink bg-card p-5 pb-7 shadow-lift ${closing ? 'animate-dialogOut' : 'animate-dialogIn'}`}>
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-extrabold">{title}</h2>
            {dismissible && <button onClick={onClose} aria-label={i18n.t('Close')} className="grid h-9 w-9 place-items-center rounded-full border-2 border-ink bg-card transition hover:bg-ink hover:text-cream active:scale-90"><LuX size={16} /></button>}
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}


/** Yes/no popup. */
export function ConfirmModal({ open, title, text, confirmLabel = 'Confirm', tone = 'primary', busy, onConfirm, onClose }: { open: boolean; title: string; text: ReactNode; confirmLabel?: string; tone?: 'primary' | 'danger'; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4 text-sm text-ink-soft">
        <div>{text}</div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} className="rounded-2xl border-2 border-ink bg-surface-tint py-3.5 font-bold text-ink transition active:scale-95">{t('Not now')}</button>
          <button onClick={onConfirm} disabled={busy} className={`rounded-2xl py-3.5 font-bold transition active:scale-95 disabled:opacity-60 ${tone === 'danger' ? 'bg-ink text-cream' : 'bg-brand text-cream'}`}>{busy ? t('Please wait…') : t(confirmLabel)}</button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------ skeleton library (flat, breathing) ------------------------------ */
const d = (i: number): CSSProperties => ({ ['--d' as string]: `${i * 0.14}s`, animationDelay: `${i * 70}ms` });

export const Skeleton = ({ className = 'h-24', i = 0 }: { className?: string; i?: number }) => <div className={`skeleton ${className}`} style={d(i)} aria-hidden />;
export const SkeletonLine = ({ w = 'w-full', h = 'h-3', i = 0 }: { w?: string; h?: string; i?: number }) => <Skeleton className={`${w} ${h} !rounded-full`} i={i} />;
export const SkeletonDot = ({ s = 'h-10 w-10', i = 0 }: { s?: string; i?: number }) => <Skeleton className={`${s} !rounded-full shrink-0`} i={i} />;

const card = 'rounded-3xl border border-ink/10 bg-card p-4 shadow-card animate-fadeUp';

/** Full-screen branded wait: used while a screen's code loads. */
export function PageSkeleton() {
  return (
    <div className="space-y-4 pt-3" aria-busy="true" aria-label={i18n.t('Loading')}>
      <div className="flex items-center gap-3"><SkeletonDot /><div className="flex-1 space-y-2"><SkeletonLine w="w-2/5" h="h-4" /><SkeletonLine w="w-1/4" /></div></div>
      {[0, 1, 2].map((i) => <div key={i} className={card} style={{ animationDelay: `${i * 90}ms` }}><div className="space-y-3"><SkeletonLine w="w-1/3" h="h-4" i={i} /><SkeletonLine i={i + 1} /><SkeletonLine w="w-4/5" i={i + 2} /></div></div>)}
    </div>
  );
}

/** One bus card: times, route line with a bus badge, operator, price, CTA. */
export function BusCardSkeleton({ i = 0 }: { i?: number }) {
  return (
    <div className={card} style={{ animationDelay: `${i * 100}ms` }} aria-hidden>
      <div className="flex justify-between"><div className="space-y-2"><Skeleton className="h-6 w-20" i={i} /><SkeletonLine w="w-14" i={i + 1} /></div><div className="space-y-2 text-right"><Skeleton className="ml-auto h-6 w-20" i={i + 1} /><SkeletonLine w="w-14" i={i + 2} /></div></div>
      <div className="relative my-5 flex items-center gap-2"><SkeletonDot s="h-2.5 w-2.5" i={i} /><div className="flex-1 border-t-2 border-dashed border-ink/15" /><span className="grid h-9 w-9 place-items-center rounded-full border-2 border-ink/15 text-ink/25 animate-pulse2"><LuBus size={16} /></span><div className="flex-1 border-t-2 border-dashed border-ink/15" /><SkeletonDot s="h-2.5 w-2.5" i={i + 1} /></div>
      <div className="flex items-end justify-between"><div className="space-y-2"><SkeletonLine w="w-32" h="h-4" i={i} /><SkeletonLine w="w-24" i={i + 1} /></div><Skeleton className="h-8 w-20" i={i + 2} /></div>
      <Skeleton className="mt-4 h-11 w-full !rounded-2xl" i={i + 1} />
    </div>
  );
}

export function ResultsSkeleton() {
  return <div className="grid grid-cols-1 gap-3 xl:grid-cols-2" aria-busy="true" aria-label={i18n.t('Loading buses')}>{[0, 1, 2, 3].map((i) => <BusCardSkeleton key={i} i={i} />)}</div>;
}

/** Bus body with a grid of breathing seat shapes (waves left to right, top to bottom). */
export function SeatMapSkeleton() {
  return (
    <div aria-busy="true" aria-label={i18n.t('Loading seats')} className="space-y-4">
      <div className="flex gap-2"><Skeleton className="h-11 flex-1 !rounded-2xl" /><Skeleton className="h-11 flex-1 !rounded-2xl" i={1} /></div>
      <div className="mx-auto w-fit rounded-[2.2rem] border-4 border-ink/15 bg-card p-4">
        <Skeleton className="mb-4 h-8 w-56 !rounded-2xl" />
        <div className="space-y-3">
          {Array.from({ length: 7 }, (_, r) => (
            <div key={r} className="flex items-center justify-center gap-2">
              {[0, 1, 'a', 2, 3].map((c, k) => (c === 'a' ? <div key={k} className="w-6" /> : <Skeleton key={k} className="h-12 w-11 !rounded-xl" i={r + Number(c)} />))}
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">{[0, 1, 2, 3, 4, 5].map((i) => <SkeletonLine key={i} h="h-4" i={i} />)}</div>
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2" aria-busy="true" aria-label={i18n.t('Loading')}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`${card} flex items-center gap-3`} style={{ animationDelay: `${i * 80}ms` }}>
          <SkeletonDot s="h-12 w-12" i={i} /><div className="flex-1 space-y-2"><SkeletonLine w="w-1/2" h="h-4" i={i} /><SkeletonLine w="w-3/4" i={i + 1} /></div><Skeleton className="h-6 w-16 !rounded-full" i={i} />
        </div>
      ))}
    </div>
  );
}

export function TicketSkeleton() {
  return (
    <div className="mx-auto max-w-md space-y-4 pt-3" aria-busy="true" aria-label={i18n.t('Loading ticket')}>
      <div className={`${card} flex flex-col items-center gap-3`}><SkeletonDot s="h-12 w-12" /><SkeletonLine w="w-40" h="h-5" i={1} /><SkeletonLine w="w-24" h="h-8" i={2} /><Skeleton className="h-24 w-full !rounded-xl" i={3} /></div>
      <div className={`${card} space-y-3`}>{[0, 1, 2, 3, 4].map((i) => <div key={i} className="flex justify-between"><SkeletonLine w="w-1/4" i={i} /><SkeletonLine w="w-1/3" i={i + 1} /></div>)}</div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="space-y-4 pt-3" aria-busy="true" aria-label={i18n.t('Loading profile')}>
      <div className={`${card} flex items-center gap-4`}><SkeletonDot s="h-16 w-16" /><div className="flex-1 space-y-2"><SkeletonLine w="w-1/2" h="h-5" i={1} /><SkeletonLine w="w-3/4" i={2} /></div></div>
      <div className={`${card} space-y-4`}><div className="flex justify-between"><SkeletonLine w="w-24" h="h-4" /><SkeletonLine w="w-20" h="h-4" i={1} /></div><Skeleton className="h-2 w-full !rounded-full" i={1} /><div className="flex justify-between">{[0, 1, 2, 3, 4].map((i) => <SkeletonDot key={i} s="h-8 w-8" i={i} />)}</div></div>
      <ListSkeleton rows={2} />
    </div>
  );
}
