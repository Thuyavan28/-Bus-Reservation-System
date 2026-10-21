import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  LuArrowRight, LuCircleCheck, LuCircleX, LuExternalLink,
  LuLock, LuScanLine, LuSmartphone, LuCopy, LuX,
} from 'react-icons/lu';
import { createPortal } from 'react-dom';
import { bookingsApi, errorMessage, paymentsApi, type InitiatedPayment } from '../utils/api';
import { approx, dateTime, duration, genderLabel, inr, tp } from '../utils/format';
import { useBooking } from '../store/booking';
import { toast } from '../store/ui';
import { Skeleton } from '../components/Overlay';
import { Arrow, Countdown, PageHeader, Spinner, StatusPill, statusText } from '../components/ui';
import { useTranslation } from 'react-i18next';

/** Idempotency key is generated once per booking and survives refreshes. */
function idemKey(bookingId: string) {
  const k = `idem:${bookingId}`;
  try { return sessionStorage.getItem(k) ?? (sessionStorage.setItem(k, crypto.randomUUID()), sessionStorage.getItem(k)!); } catch { return crypto.randomUUID(); }
}

/** Countdown bar that fires onDone after N seconds, with a live second display. */
function ErrorCountdown({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const id = setInterval(() => setLeft((n) => {
      if (n <= 1) { clearInterval(id); onDone(); return 0; }
      return n - 1;
    }), 1000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="w-full space-y-3">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
        <div
          className="h-full rounded-full bg-red-400 transition-all duration-1000 ease-linear"
          style={{ width: `${(left / seconds) * 100}%` }}
        />
      </div>
      <p className="flex items-center justify-center gap-2 text-sm text-ink-soft">
        <span>🏠</span>
        Redirecting to home in <b className="text-ink">{left}s</b>…
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────
   Google Pay-style payment result overlay
───────────────────────────────────────── */
type OverlayPhase = 'loading' | 'success' | 'error';

function PaymentResultOverlay({
  phase,
  amount,
  pnr,
  reason,
  onClose,
}: {
  phase: OverlayPhase;
  amount?: number;
  pnr?: string;
  reason?: string;
  onClose?: () => void;
}) {
  const [animStep, setAnimStep] = useState<'spinner' | 'result'>(phase === 'loading' ? 'spinner' : 'result');

  // When phase transitions from loading → result, delay briefly then show result
  useEffect(() => {
    if (phase === 'loading') {
      setAnimStep('spinner');
    } else {
      const t = setTimeout(() => setAnimStep('result'), 120);
      return () => clearTimeout(t);
    }
  }, [phase]);

  const isSuccess = phase === 'success' && animStep === 'result';
  const isError = phase === 'error' && animStep === 'result';
  const isLoading = animStep === 'spinner';

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
      role="dialog"
      aria-modal="true"
      aria-live="polite"
    >
      <div
        className="relative mx-4 w-full max-w-sm overflow-hidden rounded-3xl bg-card shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
        style={{ animation: 'payFadeUp 0.35s cubic-bezier(.2,.9,.3,1) both' }}
      >
        {/* Close button — only when result shown */}
        {!isLoading && onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full border border-ink/15 bg-surface-tint text-ink-soft transition hover:bg-ink/10"
          >
            <LuX size={15} />
          </button>
        )}

        <div className="flex flex-col items-center gap-0 px-7 pb-8 pt-10 text-center">
          {/* ── LOADING phase ── */}
          {isLoading && (
            <div className="flex flex-col items-center gap-5 py-4">
              {/* Single-color brand spinner */}
              <div className="relative h-20 w-20">
                <div
                  className="absolute inset-0 rounded-full"
                  style={{ border: '4px solid rgba(229,18,58,0.12)' }}
                />
                <svg
                  className="absolute inset-0 h-full w-full"
                  viewBox="0 0 80 80"
                  style={{ animation: 'payLoader 0.85s linear infinite' }}
                >
                  <circle
                    cx="40" cy="40" r="36"
                    fill="none"
                    stroke="#E5123A"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray="80 148"
                    strokeDashoffset="0"
                  />
                </svg>
              </div>
              <div>
                <p className="text-base font-extrabold text-ink">Processing payment…</p>
                <p className="mt-1 text-sm text-ink-soft">Please wait while we confirm</p>
              </div>
              <div className="flex gap-2">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-2 w-2 rounded-full bg-brand/40"
                    style={{ animation: `payPulse 1.6s ease-in-out ${i * 260}ms infinite` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── SUCCESS phase ── */}
          {isSuccess && (
            <>
              {/* Ripple rings behind the check */}
              <div className="relative mb-5 flex h-28 w-28 items-center justify-center">
                {/* Outer ripple */}
                <span
                  className="absolute h-28 w-28 rounded-full bg-green-500/20"
                  style={{ animation: 'payRipple 1s ease-out 0.15s forwards' }}
                />
                {/* Middle ripple */}
                <span
                  className="absolute h-20 w-20 rounded-full bg-green-500/30"
                  style={{ animation: 'payRipple 1s ease-out 0s forwards' }}
                />
                {/* Green circle with SVG checkmark */}
                <span
                  className="relative z-10 flex h-20 w-20 items-center justify-center rounded-full bg-green-500"
                  style={{ animation: 'payCheckBg 0.4s cubic-bezier(.2,.9,.3,1) both' }}
                >
                  <svg viewBox="0 0 52 52" className="h-10 w-10" aria-hidden>
                    <path
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M14 27l9 9 16-18"
                      strokeDasharray="60"
                      strokeDashoffset="60"
                      style={{ animation: 'payCheck 0.45s ease-out 0.3s forwards' }}
                    />
                  </svg>
                </span>
              </div>

              <p
                className="text-xl font-extrabold text-green-700"
                style={{ animation: 'payFadeUp 0.4s ease-out 0.45s both' }}
              >
                Payment Successful!
              </p>
              {amount != null && (
                <p
                  className="mt-1 text-3xl font-extrabold tabular-nums text-ink"
                  style={{ animation: 'payFadeUp 0.4s ease-out 0.55s both' }}
                >
                  {inr(amount)}
                </p>
              )}
              {pnr && (
                <p
                  className="mt-2 rounded-full border border-green-200 bg-green-50 px-4 py-1 text-sm font-bold text-green-700"
                  style={{ animation: 'payFadeUp 0.4s ease-out 0.65s both' }}
                >
                  PNR: {pnr}
                </p>
              )}
              <p
                className="mt-3 text-sm text-ink-soft"
                style={{ animation: 'payFadeUp 0.4s ease-out 0.75s both' }}
              >
                Your booking is confirmed. Opening ticket…
              </p>
            </>
          )}

          {/* ── ERROR phase ── */}
          {isError && (
            <>
              <div className="relative mb-5 flex h-24 w-24 items-center justify-center">
                <span
                  className="absolute h-24 w-24 rounded-full bg-red-500/15"
                  style={{ animation: 'payRipple 0.7s ease-out 0.1s forwards' }}
                />
                <span
                  className="relative z-10 flex h-20 w-20 items-center justify-center rounded-full bg-red-50 border-2 border-red-200 text-red-600"
                  style={{ animation: 'payError 0.45s cubic-bezier(.2,.9,.3,1) both' }}
                >
                  <LuCircleX size={40} strokeWidth={1.5} />
                </span>
              </div>

              <p
                className="text-xl font-extrabold text-ink"
                style={{ animation: 'payFadeUp 0.4s ease-out 0.1s both' }}
              >
                Payment Failed
              </p>
              <p
                className="mt-2 text-sm text-ink-soft"
                style={{ animation: 'payFadeUp 0.4s ease-out 0.2s both' }}
              >
                {reason ?? "Your transaction wasn't completed. Your seats may still be held."}
              </p>

              {/* Auto-redirect countdown */}
              <div
                className="mt-5 w-full"
                style={{ animation: 'payFadeUp 0.4s ease-out 0.3s both' }}
              >
                <ErrorCountdown seconds={5} onDone={onClose!} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes payFadeUp  { from { opacity:0; transform:translateY(16px);} to { opacity:1; transform:translateY(0);} }
        @keyframes payRipple  { from { transform:scale(1); opacity:0.6; } to { transform:scale(2.4); opacity:0; } }
        @keyframes payCheckBg { 0%{transform:scale(0);opacity:0;} 55%{transform:scale(1.12);opacity:1;} 100%{transform:scale(1);opacity:1;} }
        @keyframes payCheck   { from { stroke-dashoffset:60; } to { stroke-dashoffset:0; } }
        @keyframes payError   { 0%{transform:scale(0);opacity:0;} 55%{transform:scale(1.15);} 100%{transform:scale(1);opacity:1;} }
        @keyframes payLoader  { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        @keyframes payPulse   { 0%,100%{transform:scale(1);opacity:.4;} 50%{transform:scale(1.18);opacity:1;} }
      `}</style>
    </div>,
    document.body,
  );
}

/* ───────────────────────────────────
   Main Payment page
─────────────────────────────────── */
export default function Payment() {
  const { t } = useTranslation();
  const { bookingId = '' } = useParams();
  const nav = useNavigate();
  const b = useBooking();
  const qc = useQueryClient();
  const [pay, setPay] = useState<InitiatedPayment | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [overlay, setOverlay] = useState<OverlayPhase | null>(null);
  const started = useRef(false);
  const overlayShown = useRef(false);

  const q = useQuery({ queryKey: ['booking', bookingId], queryFn: () => bookingsApi.get(bookingId) });
  const bk = q.data;
  const payable = bk?.status === 'pending_payment';

  // Create the payment (QR) as soon as the booking is known to be payable
  useEffect(() => {
    if (!payable || started.current) return;
    started.current = true;
    paymentsApi.initiate(bookingId, idemKey(bookingId))
      .then(setPay)
      .catch((e) => { started.current = false; toast.error(errorMessage(e)); });
  }, [payable, bookingId]);

  // Poll payment status — fast interval
  const status = useQuery({
    queryKey: ['pay', pay?.reference],
    queryFn: () => paymentsApi.status(pay!.reference),
    enabled: !!pay && !overlayShown.current,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return (s === 'success' || s === 'failed') ? false : 800;
    },
  });
  const st = status.data;

  // Re-poll immediately when the user switches back to this tab (phone scanning triggers state change)
  useEffect(() => {
    if (!pay || overlayShown.current) return;
    const handler = () => {
      if (!document.hidden) {
        qc.invalidateQueries({ queryKey: ['pay', pay.reference] });
        qc.invalidateQueries({ queryKey: ['booking', bookingId] });
      }
    };
    document.addEventListener('visibilitychange', handler);
    window.addEventListener('focus', handler);
    return () => {
      document.removeEventListener('visibilitychange', handler);
      window.removeEventListener('focus', handler);
    };
  }, [pay, bookingId, qc]);

  // Trigger the animated single-color loader and success popup
  const triggerSuccess = useCallback(() => {
    if (overlayShown.current) return;
    overlayShown.current = true;
    setOverlay('loading'); // Show single-color loader first
    b.clearSelection();
    setTimeout(() => {
      setOverlay('success'); // Show success popup
    }, 1500);
    // After success popup display (3s), navigate to ticket page
    setTimeout(() => {
      nav(`/booking/${bookingId}`, { replace: true });
    }, 4500);
  }, [b, bookingId, nav]);

  const triggerError = useCallback((reason?: string) => {
    if (overlayShown.current) return;
    overlayShown.current = true;
    setOverlay('loading'); // Single color loader
    b.clearSelection();
    setRejected(true);
    setTimeout(() => {
      setOverlay('error');
    }, 1200);
  }, [b]);

  // React to payment status change
  useEffect(() => {
    if (!st) return;
    if (st.status === 'success' || st.bookingStatus === 'booked') {
      triggerSuccess();
    } else if (st.status === 'failed') {
      triggerError(st.reason);
    }
  }, [st?.status, st?.bookingStatus, triggerSuccess, triggerError]);

  // If booking data indicates booked, trigger the same popup flow (never skip directly)
  useEffect(() => {
    if (bk?.status === 'booked' && !overlayShown.current) {
      triggerSuccess();
    }
  }, [bk?.status, triggerSuccess]);

  const handleRetry = useCallback(async () => {
    setOverlay(null);
    setRejected(false);
    overlayShown.current = false;
    started.current = false;
    try {
      const p = await paymentsApi.initiate(bookingId, crypto.randomUUID());
      setPay(p);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, [bookingId]);

  async function viaWebsite() {
    setBusy(true);
    try { window.location.href = (await paymentsApi.initiate(bookingId, idemKey(bookingId))).redirectUrl; }
    catch (e) { toast.error(errorMessage(e)); setBusy(false); }
  }

  if (q.isLoading) return (
    <div className="space-y-4">
      <PageHeader title={t('Payment')} />
      <Skeleton className="h-28 !rounded-3xl" />
      <Skeleton className="h-80 !rounded-3xl" i={1} />
    </div>
  );
  if (!bk) return <div className="rounded-3xl border border-ink/10 bg-card p-8 text-center">{t('Booking not found.')}</div>;

  if (rejected && !overlay && bk.status !== 'booked') {
    // Error popup already shown; if user closed it or got here via page reload, go home
    nav('/home', { replace: true });
    return null;
  }

  if (!payable && bk.status !== 'booked') {
    return (
      <div className="space-y-4">
        <PageHeader title={t('Payment')} />
        <div className="rounded-3xl border border-ink/10 bg-card p-8 text-center">
          <p className="font-bold">{t('This booking is {{status}}.', { status: statusText(bk.status) })}</p>
          <button className="mt-4 rounded-2xl bg-brand px-6 py-3 font-extrabold text-white" onClick={() => nav('/home')}>{t('Search again')}</button>
        </div>
      </div>
    );
  }

  const isWaiting = st && st.status !== 'success' && st.status !== 'failed';

  return (
    <>
      {/* Payment result overlay */}
      {overlay && (
        <PaymentResultOverlay
          phase={overlay}
          amount={bk?.price?.total}
          pnr={st?.pnr}
          reason={st?.reason}
          onClose={overlay === 'error' ? () => nav('/home', { replace: true }) : undefined}
        />
      )}

      <div>
        <PageHeader title={t('Payment')} subtitle={t('Scan to pay and place your order')} right={<StatusPill status={bk.status} />} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start lg:gap-8">
          <div className="space-y-4">
            <Countdown to={bk.holdExpiresAt} onExpire={() => { b.clearSelection(); q.refetch(); }} />

            <section className="rounded-3xl border border-ink/10 bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-lg font-extrabold">{tp(bk.from)}<Arrow />{tp(bk.to)}</p>
                  <p className="text-xs text-ink-soft">{bk.operator} · {dateTime(bk.trip.departureTime)}</p>
                </div>
                <p className="text-2xl font-extrabold text-brand-700">{inr(bk.price.total)}</p>
              </div>
              <p className="mt-2 text-xs text-ink-soft">{bk.distanceKm != null ? <>{approx(bk.estimateSource)}{bk.distanceKm} {t('km ·')} {approx(bk.estimateSource)}{duration(bk.durationMin)} {t('· arrives')} {dateTime(bk.arrivalTime)}</> : t('Estimate unavailable')}</p>
              <ul className="mt-3 divide-y divide-ink/5 border-t border-ink/10 text-sm">
                {bk.passengers.map((p: any) => <li key={p.seatId} className="flex justify-between py-2"><span>{p.name} <span className="text-ink-soft">({p.age}, {genderLabel(p.gender)})</span> {t('· Seat')} {p.seatLabel}</span><span className="font-bold">{inr(p.fare)}</span></li>)}
              </ul>
              <div className="mt-1 space-y-1 border-t border-dashed border-ink/15 pt-3 text-sm">
                <div className="flex justify-between text-ink-soft"><span>{t('Fare')}</span><span>{inr(bk.price.base)}</span></div>
                <div className="flex justify-between text-ink-soft"><span>{t('GST (5%)')}</span><span>{inr(bk.price.gst)}</span></div>
              </div>
            </section>

            <button onClick={viaWebsite} disabled={busy} className="hidden w-full items-center justify-center gap-2 rounded-2xl border-2 border-ink/20 bg-card py-3.5 text-sm font-bold text-ink-soft transition hover:border-ink lg:flex">
              <LuExternalLink size={16} />{busy ? t('Redirecting…') : t('Pay on a payment website instead')}
            </button>
          </div>

          <div className="space-y-4 lg:sticky lg:top-24">
            {/* QR section */}
            <section className="rounded-[2rem] border border-ink/10 bg-card p-5 text-center shadow-card">
              <p className="flex items-center justify-center gap-2 text-sm font-extrabold">
                <LuScanLine size={17} className="text-brand-700" />{t('Scan this QR with your phone')}
              </p>
              <div className="relative mx-auto mt-4 grid h-64 w-64 place-items-center rounded-3xl bg-white p-3 shadow-glow">
                {pay ? <img src={pay.qr} alt={t('Payment QR code')} className="h-full w-full" /> : <Spinner />}
                {pay && !overlay && <span className="pointer-events-none absolute inset-x-4 h-0.5 animate-scan rounded-full bg-brand shadow-[0_0_14px_#E5123A]" />}
              </div>
              <p className="mt-4 text-3xl font-extrabold tabular-nums">{inr(bk.price.total)}</p>

              {/* Dynamic status indicator */}
              <div className="mt-2 flex items-center justify-center gap-2 text-sm">
                {!pay && <span className="text-ink-soft">{t('Preparing your payment…')}</span>}
                {pay && !st && <><span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" /><span className="text-ink-soft">{t('Waiting for you to accept the payment…')}</span></>}
                {pay && (st?.status === 'success' || bk?.status === 'booked') && (
                  <div className="flex items-center justify-center gap-2 text-sm font-bold text-brand">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                    <span>Payment received! Confirming your booking…</span>
                  </div>
                )}
              </div>

              <ol className="mt-4 space-y-2 rounded-2xl bg-ink/5 p-3.5 text-left text-xs text-ink-soft">
                <li className="flex gap-2"><LuSmartphone size={15} className="mt-0.5 shrink-0 text-brand-700" />{t('Scan the QR with your phone camera.')}</li>
                <li className="flex gap-2"><LuCircleCheck size={15} className="mt-0.5 shrink-0 text-green-700" />{t('Tap')} <b className="text-ink">{t('Accept payment')}</b>{t(': your order is placed instantly.')}</li>
                <li className="flex gap-2"><LuCircleX size={15} className="mt-0.5 shrink-0 text-red-700" />{t('Tap')} <b className="text-ink">{t('Reject')}</b>{t(': the order is removed and seats are released.')}</li>
              </ol>

              {pay && (
                <a href={pay.approveUrl} target="_blank" rel="noreferrer" className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-ink/15 py-3 text-sm font-bold">
                  {t('Open the approval page on this device')} <LuArrowRight size={15} />
                </a>
              )}
              {pay && (
                <div className="mt-3 space-y-2 text-center">
                  <p className="break-all rounded-xl bg-ink/5 px-3 py-2 text-[11px] font-semibold text-ink-soft" dir="ltr">{pay.approveUrl}</p>
                  <button
                    type="button"
                    onClick={() => { void navigator.clipboard?.writeText(pay.approveUrl).then(() => toast.success(t('Link copied')), () => toast.error(t('Could not copy the link'))); }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-3.5 py-1.5 text-xs font-extrabold transition active:scale-95"
                  >
                    <LuCopy size={13} />{t('Copy link')}
                  </button>
                  {pay.reachable
                    ? (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(new URL(pay.approveUrl).hostname) && <p className="text-[11px] text-ink-soft">{t('Your phone must be on the same Wi-Fi network as this computer.')}</p>)
                    : <p role="alert" className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[11px] font-semibold text-amber-800">{t('This address only works on this computer. Open the site on your computer\'s network address, or deploy it, so a phone can scan the QR.')}</p>}
                </div>
              )}
            </section>

            <button onClick={viaWebsite} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-ink/20 bg-card py-3.5 text-sm font-bold text-ink-soft lg:hidden">
              <LuExternalLink size={16} />{busy ? t('Redirecting…') : t('Pay on a payment website instead')}
            </button>
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-soft">
              <LuLock size={12} />{t('Cancellation: refund = ticket minus the operator fee, once a replacement books your seat.')}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

/** Where an external payment site sends the browser back. Polls until the webhook lands. */
export function PaymentReturn() {
  const { t } = useTranslation();
  const [sp] = useSearchParams();
  const ref = sp.get('ref') ?? '';
  const nav = useNavigate();
  const b = useBooking();
  const [overlay, setOverlay] = useState<OverlayPhase | null>('loading');
  const shown = useRef(false);

  const q = useQuery({
    queryKey: ['pay', ref],
    queryFn: () => paymentsApi.status(ref),
    enabled: !!ref,
    refetchInterval: (query) => (['success', 'failed'].includes(query.state.data?.status) && query.state.data?.bookingStatus !== 'pending_payment' ? false : 1000),
  });
  const d = q.data;

  useEffect(() => {
    if (!d || shown.current) return;
    if (d.status === 'success' && d.bookingStatus === 'booked') {
      shown.current = true;
      setOverlay('loading');
      setTimeout(() => setOverlay('success'), 1200);
      b.clearSelection();
      setTimeout(() => nav(`/booking/${d.bookingId}`, { replace: true }), 4000);
    } else if (d.status === 'failed') {
      shown.current = true;
      setOverlay('loading');
      setTimeout(() => setOverlay('error'), 1000);
    }
  }, [d?.status, d?.bookingStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pt-6">
      {overlay && (
        <PaymentResultOverlay
          phase={overlay}
          amount={d?.amount}
          pnr={d?.pnr}
          reason={d?.reason}
          onClose={overlay === 'error' ? () => nav('/home', { replace: true }) : undefined}
        />
      )}
      <div className="space-y-3 rounded-[2rem] border border-ink/10 bg-card p-7 text-center shadow-card">
        <Spinner />
        <p className="font-bold">{t('Waiting for payment confirmation…')}</p>
        <p className="text-sm text-ink-soft">{t('This updates automatically once you approve.')}</p>
      </div>
    </div>
  );
}
