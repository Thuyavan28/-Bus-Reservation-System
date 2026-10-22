import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { LuArmchair, LuBadgeCheck, LuBus, LuCircleCheck, LuCircleX, LuClock, LuHourglass, LuLock, LuRefreshCw, LuRoute } from 'react-icons/lu';
import { ApiError, errorMessage, paymentsApi } from '../utils/api';
import { dateTime, inr, tp } from '../utils/format';
import { Skeleton, SkeletonLine } from '../components/Overlay';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';

type Outcome = 'accepted' | 'rejected' | null;

/**
 * Opened by scanning the payment QR (public: the token in the link is the credential).
 * Accept places the order; reject removes it and releases the seats.
 */
export default function PaymentApprove() {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [err, setErr] = useState('');
  const q = useQuery({ queryKey: ['approve', token], queryFn: () => paymentsApi.approvalInfo(token), retry: false, refetchInterval: (query) => (query.state.data?.status === 'created' ? 5000 : false) });
  const d = q.data;

  async function decide(decision: 'accept' | 'reject') {
    setBusy(decision);
    setErr('');
    try {
      const r = await paymentsApi.decide(token, decision);
      setOutcome(r.status === 'success' ? 'accepted' : 'rejected');
      q.refetch();
    } catch (e) {
      setErr(e instanceof ApiError && e.code === 'PAYMENT_EXPIRED' ? i18n.t('The seat hold expired. Please start the booking again.') : errorMessage(e));
      q.refetch();
    } finally { setBusy(null); }
  }

  const is404 = q.error instanceof ApiError && q.error.status === 404;
  const isExpired = q.error instanceof ApiError && (q.error.status === 410 || q.error.code === 'PAYMENT_EXPIRED');

  const state: 'loading' | 'invalid' | 'network_error' | 'open' | 'accepted' | 'rejected' | 'expired' =
    q.isLoading
      ? 'loading'
      : q.isError
        ? isExpired
          ? 'expired'
          : is404
            ? 'invalid'
            : 'network_error'
        : outcome ?? (d!.status === 'success' ? 'accepted' : d!.status === 'failed' ? 'rejected' : d!.status === 'expired' ? 'expired' : 'open');

  return (
    <div className="min-h-screen bg-brand">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-5 py-8">
        <div className="mb-6 flex items-center gap-2.5"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-brand"><LuBus size={20} /></span><span className="font-extrabold text-cream">{t('BusGo South')}</span></div>

        <div className="w-full animate-pop rounded-3xl border-2 border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          {state === 'loading' && (
            <div className="space-y-4 py-4" aria-busy="true">
              <SkeletonLine w="w-1/2" h="h-5" />
              <Skeleton className="h-20 !rounded-2xl" i={1} />
              <Skeleton className="h-32 !rounded-2xl" i={2} />
              <Skeleton className="h-14 !rounded-2xl" i={3} />
            </div>
          )}

          {state === 'invalid' && (
            <Result
              tone="red"
              icon={<LuCircleX size={36} />}
              title={t('Invalid payment link')}
              text={t('This QR code is not valid or has been replaced. Please scan the latest QR on the payment screen.')}
            />
          )}

          {state === 'network_error' && (
            <div className="space-y-4 py-4 text-center">
              <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-amber-400/20 text-amber-800">
                <LuRefreshCw size={36} />
              </span>
              <div>
                <p className="text-2xl font-extrabold">{t('Connection Problem')}</p>
                <p className="mt-2 text-sm text-ink-soft">
                  {t('Unable to connect to the server. Please ensure your phone is connected to the same Wi-Fi network as your computer.')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => q.refetch()}
                className="inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-3 text-sm font-extrabold text-white shadow-glow transition active:scale-95"
              >
                <LuRefreshCw size={16} /> {t('Retry')}
              </button>
            </div>
          )}

          {state === 'expired' && (
            <Result
              tone="amber"
              icon={<LuHourglass size={34} />}
              title={t('Payment expired')}
              text={t('The seat hold for this order has run out. Start the booking again to get a new QR code.')}
            />
          )}

          {state === 'accepted' && (
            <div className="space-y-5 py-2 text-center">
              <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
                <span className="absolute h-24 w-24 rounded-full bg-green-500/20 animate-ping" />
                <span className="relative z-10 grid h-20 w-20 place-items-center rounded-full bg-green-500 text-white shadow-lg">
                  <LuBadgeCheck size={44} />
                </span>
              </div>
              <div>
                <h3 className="text-2xl font-black text-ink">Payment Successful!</h3>
                <p className="mt-1 text-sm font-semibold text-green-700">Ticket Confirmed</p>
              </div>

              {d && (
                <div className="rounded-2xl border border-ink/10 bg-ink/5 p-4 text-left text-sm space-y-2.5">
                  {d.pnr && (
                    <div className="flex items-center justify-between border-b border-ink/10 pb-2">
                      <span className="text-xs font-bold text-ink-soft uppercase tracking-wider">PNR Number</span>
                      <span className="rounded-lg bg-brand/10 px-2.5 py-1 text-sm font-black text-brand tracking-wider">{d.pnr}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-soft">Amount Paid</span>
                    <span className="text-base font-black text-ink">{inr(d.amount)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-soft">Route</span>
                    <span className="font-bold text-ink text-right">{d.route.split(' to ').map((c: string) => tp(c)).join(' → ')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-soft">Seats</span>
                    <span className="font-bold text-brand">{d.seats.join(', ')}</span>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-green-300 bg-green-50 p-3 text-xs text-green-800 font-semibold leading-relaxed">
                ✉️ An official e-ticket and printable PDF with boarding barcode has been sent to your email.
              </div>

              <p className="text-xs text-ink-soft">
                Your payment screen will now automatically display your boarding pass and bus tracker.
              </p>
            </div>
          )}

          {state === 'rejected' && (
            <Result
              tone="red"
              icon={<LuCircleX size={36} />}
              title={t('Payment rejected')}
              text={t('The order was removed and your seats were released.')}
            />
          )}

          {state === 'open' && d && (
            <div className="space-y-5">
              <div className="text-center">
                <span className="inline-block rounded-full bg-brand/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-brand">
                  {t('Payment Request')}
                </span>
                <p className="mt-2 text-xs font-semibold text-ink-soft">{d.merchant}</p>
                <p className="mt-1 text-5xl font-black tracking-tight text-ink">{inr(d.amount)}</p>
              </div>

              <ul className="space-y-2.5 rounded-2xl border border-ink/10 bg-ink/5 p-4 text-sm">
                <li className="flex items-center gap-3">
                  <LuRoute size={16} className="text-brand shrink-0" />
                  <span className="flex-1 text-ink-soft">{t('Route')}</span>
                  <b className="text-ink">{d.route.split(' to ').map((c: string) => tp(c)).join(' → ')}</b>
                </li>
                <li className="flex items-center gap-3">
                  <LuClock size={16} className="text-brand shrink-0" />
                  <span className="flex-1 text-ink-soft">{t('Departs')}</span>
                  <b className="text-ink">{dateTime(d.departureTime)}</b>
                </li>
                <li className="flex items-center gap-3">
                  <LuArmchair size={16} className="text-brand shrink-0" />
                  <span className="flex-1 text-ink-soft">{t('Seats')}</span>
                  <b className="text-brand">{d.seats.join(', ')}</b>
                </li>
              </ul>

              {err && (
                <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-semibold text-red-700">
                  {err}
                </p>
              )}

              <div className="space-y-2.5">
                <button
                  onClick={() => decide('accept')}
                  disabled={!!busy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-black bg-brand py-3.5 text-base font-extrabold text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-95 disabled:opacity-60"
                >
                  {busy === 'accept' ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <LuCircleCheck size={20} />
                  )}
                  {t('Accept payment')}
                </button>
                <button
                  onClick={() => decide('reject')}
                  disabled={!!busy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-black bg-white py-3 text-sm font-extrabold text-red-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-95 disabled:opacity-60"
                >
                  {busy === 'reject' ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-300/30 border-t-red-300" />
                  ) : (
                    <LuCircleX size={18} />
                  )}
                  {t('Reject')}
                </button>
              </div>
              <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-soft">
                <LuLock size={12} />
                {t('Accept places the order. Reject removes it and frees the seats.')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Result({ tone, icon, title, text }: { tone: 'green' | 'red' | 'amber'; icon: React.ReactNode; title: string; text: string }) {
  const c = { green: 'bg-green-500/20 text-green-700', red: 'bg-red-500/20 text-red-700', amber: 'bg-amber-400/20 text-amber-800' }[tone];
  return (
    <div className="space-y-3 py-4 text-center">
      <span className={`mx-auto grid h-20 w-20 animate-tick place-items-center rounded-full ${c}`}>{icon}</span>
      <p className="text-2xl font-extrabold">{title}</p>
      <p className="text-sm text-ink-soft">{text}</p>
    </div>
  );
}
