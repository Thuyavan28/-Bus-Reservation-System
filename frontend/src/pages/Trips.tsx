import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LuBan, LuClock, LuHourglass, LuInbox, LuRadar, LuTicket, LuWallet } from 'react-icons/lu';
import { bookingsApi, errorMessage } from '../utils/api';
import { approx, dateTime, duration, inr, tp } from '../utils/format';
import { toast } from '../store/ui';
import { ConfirmModal, ListSkeleton, Skeleton } from '../components/Overlay';
import { Arrow, PageHeader, StatusPill, statusText } from '../components/ui';

import { EmptyState } from '../components/states/EmptyState';
import { ErrorState } from '../components/states/ErrorState';

const TABS = [['upcoming', 'upcoming'], ['completed', 'completed'], ['cancelled', 'cancelled'], ['pending', 'cancellationPending']] as const;

export default function Trips() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('upcoming');
  const q = useQuery({ queryKey: ['bookings', tab], queryFn: () => bookingsApi.list(tab) });
  return (
    <div className="space-y-4">
      <PageHeader to="/home" title={t('trips')} subtitle={t('Your tickets and cancellations')} />
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex w-max min-w-full gap-1.5 rounded-2xl border-2 border-black bg-white p-1.5 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]" role="tablist">
          {TABS.map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`shrink-0 rounded-xl border-2 px-4 py-2 text-sm font-extrabold transition active:scale-95 ${
                tab === k
                  ? 'border-black bg-brand text-white shadow-sm'
                  : 'border-transparent text-ink-soft hover:border-black/20 hover:text-ink'
              }`}
            >
              {t(label)}
            </button>
          ))}
        </div>
      </div>
      {q.isLoading && <ListSkeleton rows={3} />}
      {q.isError && (
        <ErrorState
          title="Couldn't load your bookings"
          message="We were unable to synchronize your ticket history. Please check your connection and retry."
          error={q.error}
          onRetry={() => { q.refetch(); }}
          onSecondaryAction={() => nav('/home')}
          secondaryActionLabel="Return to Home"
        />
      )}
      {q.isSuccess && q.data.length === 0 && (
        <EmptyState
          variant={tab === 'upcoming' ? 'first-use' : 'cleared'}
          title={
            tab === 'upcoming'
              ? 'No upcoming bus journeys'
              : tab === 'cancelled'
              ? 'No cancelled tickets'
              : tab === 'completed'
              ? 'No past completed trips'
              : 'No pending cancellations'
          }
          description={
            tab === 'upcoming'
              ? 'Ready to hit the road? Search express buses across South India with guaranteed seats and live tracking.'
              : 'All your previous trips and refund settlements are cleanly recorded here.'
          }
          primaryAction={{
            label: 'Search Available Buses',
            onClick: () => nav('/home'),
          }}
        />
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {q.data?.map((b, i) => (
        <article key={b.id} style={{ animationDelay: `${i * 50}ms` }} className="animate-fadeUp space-y-3 rounded-3xl border-2 border-black bg-white p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><p className="truncate text-base font-extrabold">{tp(b.from)}<Arrow />{tp(b.to)}</p><p className="truncate text-xs text-ink-soft">{b.operator} {t('· PNR')} {b.pnr}</p></div>
            <StatusPill status={b.status} />
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"><span className="flex items-center gap-1.5"><LuClock size={14} className="text-brand-700" />{dateTime(b.trip.departureTime)}</span><span className="flex items-center gap-1.5 text-ink-soft"><LuTicket size={14} />{b.passengers.map((p: any) => p.seatLabel).join(', ')}</span><span className="font-extrabold">{inr(b.price.total)}</span></p>
          {b.distanceKm != null && <p className="text-xs text-ink-soft">{approx(b.estimateSource)}{b.distanceKm} {t('km ·')} {approx(b.estimateSource)}{duration(b.durationMin)}</p>}
          {b.status === 'cancellation_pending' && <p className="flex gap-2 rounded-2xl border-2 border-black bg-seat-wait/15 p-3 text-xs font-semibold text-red-800"><LuHourglass size={16} className="mt-0.5 shrink-0" />{t('Awaiting a replacement booking for your seat. Expected refund {{amount}}. Decision by {{date}}.', { amount: inr(b.cancellation?.refundAmount), date: dateTime(b.cancellation?.cutoffAt) })}</p>}
          {b.refund && <p className="flex gap-2 rounded-2xl border-2 border-black bg-seat-booked/15 p-3 text-xs font-semibold text-blue-900"><LuWallet size={16} className="mt-0.5 shrink-0" />{t('Refund {{amount}} (ticket {{ticket}} minus {{fee}})', { amount: inr(b.refund.amount), ticket: inr(b.cancellation?.ticketAmount), fee: inr(b.refund.deduction) })} · {statusText(b.refund.status)}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <Link to={`/booking/${b.id}`} className="flex items-center gap-1.5 rounded-xl border-2 border-black bg-brand-100 px-4 py-2 text-sm font-extrabold text-brand-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px]"><LuTicket size={15} />{t('Ticket')}</Link>
            {b.status === 'booked' && new Date(b.trip.departureTime) > new Date() && <>
              <Link to={`/track/${b.id}`} className="flex items-center gap-1.5 rounded-xl border-2 border-black bg-white px-4 py-2 text-sm font-extrabold text-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px]"><LuRadar size={15} />{t('Track bus')}</Link>
              <Link to={`/trips/${b.id}/cancel`} className="flex items-center gap-1.5 rounded-xl border-2 border-black bg-red-100 px-4 py-2 text-sm font-extrabold text-red-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px]"><LuBan size={15} />{t('Cancel')}</Link>
            </>}
          </div>
        </article>
      ))}
      </div>
    </div>
  );
}

export function Cancel() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [ask, setAsk] = useState(false);
  const q = useQuery({ queryKey: ['cancel-preview', id], queryFn: () => bookingsApi.cancelPreview(id) });
  const m = useMutation({
    mutationFn: () => bookingsApi.cancel(id),
    onSuccess: () => { toast.success(t('Cancellation requested. We are awaiting a replacement booking.')); nav('/trips', { replace: true }); },
    onError: (e) => { setAsk(false); toast.error(errorMessage(e)); },
  });
  const p = q.data;
  if (q.isLoading) return <div className="space-y-4"><PageHeader title={t('Cancel booking')} /><Skeleton className="h-40 !rounded-3xl border-2 border-black" /><Skeleton className="h-52 !rounded-3xl border-2 border-black" i={1} /></div>;
  if (!p) return <div className="rounded-3xl border-2 border-black bg-white p-8 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">{t('Booking not found.')}</div>;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title={t('Cancel booking')} subtitle={t('See your refund before you submit')} />
      <section className="space-y-2.5 rounded-3xl border-2 border-black bg-white p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <p className="font-extrabold">{t('Refund breakdown')}</p>
        <div className="flex justify-between text-sm"><span className="text-ink-soft">{t('Ticket amount')}</span><span className="font-bold">{inr(p.ticketAmount)}</span></div>
        <div className="flex justify-between text-sm text-red-700"><span>{t('Cancellation fee')}</span><span className="font-bold">− {inr(p.fee)}</span></div>
        <div className="flex justify-between border-t-2 border-dashed border-black/20 pt-3 text-xl font-extrabold text-brand-700"><span>{t('You get back')}</span><span>{inr(p.refundAmount)}</span></div>
      </section>
      <section className="space-y-2 rounded-3xl border-2 border-black bg-white p-5 text-sm text-ink-soft shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <p className="font-extrabold text-ink">{t('What happens next')}</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>{t('Your booking becomes Cancellation Pending. Your seat is not released yet. We are awaiting a replacement booking.')}</li>
          <li>{t('When another eligible passenger books your seat, your booking is cancelled and the {{amount}} refund starts. You are emailed at each step.', { amount: inr(p.refundAmount) })}</li>
          <li>{t('If nobody books it by {{date}}, the operator\'s fallback applies: {{rule}}.', { date: dateTime(p.cutoffAt), rule: p.fallbackPolicy === 'reject' ? t('the cancellation is rejected and your booking stays confirmed') : t('standard terms ({{pct}}% refund)', { pct: p.standardRefundPercent }) })}</li>
        </ol>
      </section>
      {p.cancellable
        ? <button onClick={() => setAsk(true)} className="w-full rounded-2xl border-2 border-black bg-brand py-4 font-extrabold text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition active:scale-[.99]">{t('Request cancellation')}</button>
        : <div className="rounded-3xl border-2 border-black bg-white p-5 text-center text-sm text-ink-soft shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">{t('This booking can no longer be cancelled ({{status}}).', { status: statusText(p.status) })}</div>}
      <ConfirmModal open={ask} title={t('Cancel this booking?')} tone="danger" confirmLabel={t('Yes, request cancellation')} busy={m.isPending} onConfirm={() => m.mutate()} onClose={() => setAsk(false)}
        text={t('You will get {{amount}} back ({{ticket}} minus {{fee}} fee) once another passenger books your seat. Until then your seat is not released.', { amount: inr(p.refundAmount), ticket: inr(p.ticketAmount), fee: inr(p.fee) })} />
    </div>
  );
}
