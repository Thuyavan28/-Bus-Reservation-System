import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { LuArmchair, LuBadgeCheck, LuBus, LuCircleCheck, LuCircleX, LuClock, LuHourglass, LuLock, LuRoute } from 'react-icons/lu';
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

  const state: 'loading' | 'invalid' | 'open' | 'accepted' | 'rejected' | 'expired' =
    q.isLoading ? 'loading' : q.isError ? 'invalid' : outcome ?? (d!.status === 'success' ? 'accepted' : d!.status === 'failed' ? 'rejected' : d!.status === 'expired' ? 'expired' : 'open');

  return (
    <div className="min-h-screen bg-brand">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-5 py-8">
        <div className="mb-6 flex items-center gap-2.5"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-brand"><LuBus size={20} /></span><span className="font-extrabold text-cream">{t('BusGo South')}</span></div>

        <div className="w-full animate-pop rounded-[2rem] border border-ink/10 bg-card p-6 shadow-lift">
          {state === 'loading' && <div className="space-y-4" aria-busy="true"><SkeletonLine w="w-1/2" h="h-5" /><Skeleton className="h-16" i={1} /><Skeleton className="h-28" i={2} /><Skeleton className="h-14 !rounded-2xl" i={3} /></div>}

          {state === 'invalid' && <Result tone="red" icon={<LuCircleX size={34} />} title={t('Invalid payment link')} text={t('This QR code is not valid or has been replaced. Please scan the latest QR on the payment screen.')} />}
          {state === 'expired' && <Result tone="amber" icon={<LuHourglass size={32} />} title={t('Payment expired')} text={t('The seat hold for this order has run out. Start the booking again to get a new QR code.')} />}
          {state === 'accepted' && <Result tone="green" icon={<LuBadgeCheck size={36} />} title={t('Payment accepted')} text={d?.pnr ? t('Your order is placed (PNR {{pnr}}). The ticket is on the other screen and in your email.', { pnr: d.pnr }) : t('Your order is placed. The ticket is on the other screen and in your email.')} />}
          {state === 'rejected' && <Result tone="red" icon={<LuCircleX size={34} />} title={t('Payment rejected')} text={t('The order was removed and your seats were released.')} />}

          {state === 'open' && d && (
            <div className="space-y-5">
              <div className="text-center">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">{t('Confirm payment to')}</p>
                <p className="mt-1 text-lg font-extrabold">{d.merchant}</p>
                <p className="mt-3 text-5xl font-extrabold tracking-tight text-brand-700">{inr(d.amount)}</p>
              </div>
              <ul className="space-y-2.5 rounded-2xl border border-ink/10 bg-ink/5 p-4 text-sm">
                <li className="flex items-center gap-3"><LuRoute size={16} className="text-brand-700" /><span className="flex-1 text-ink-soft">{t('Route')}</span><b>{d.route.split(' to ').map((c: string) => tp(c)).join(' → ')}</b></li>
                <li className="flex items-center gap-3"><LuClock size={16} className="text-brand-700" /><span className="flex-1 text-ink-soft">{t('Departs')}</span><b>{dateTime(d.departureTime)}</b></li>
                <li className="flex items-center gap-3"><LuArmchair size={16} className="text-brand-700" /><span className="flex-1 text-ink-soft">{t('Seats')}</span><b>{d.seats.join(', ')}</b></li>
              </ul>
              {err && <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-semibold text-red-700">{err}</p>}
              <div className="space-y-2.5">
                <button onClick={() => decide('accept')} disabled={!!busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-4 text-base font-extrabold text-cream shadow-glow transition active:scale-[.98] disabled:opacity-60">
                  {busy === 'accept' ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-app/30 border-t-app" /> : <LuCircleCheck size={20} />}{t('Accept payment')}
                </button>
                <button onClick={() => decide('reject')} disabled={!!busy} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-400/40 bg-red-500/10 py-4 text-base font-extrabold text-red-700 transition active:scale-[.98] disabled:opacity-60">
                  {busy === 'reject' ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-300/30 border-t-red-300" /> : <LuCircleX size={20} />}{t('Reject')}
                </button>
              </div>
              <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-soft"><LuLock size={12} />{t('Accept places the order. Reject removes it and frees the seats.')}</p>
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
