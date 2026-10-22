import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { BusLayout, Gender, SeatDef } from '@busgo/shared';
import { LuArmchair, LuArrowRight, LuBus, LuClock, LuFrown, LuRoute, LuSnowflake } from 'react-icons/lu';
import { ApiError, errorMessage, tripsApi, type TripDetail } from '../utils/api';
import { approx, busTypeLabel, dateTime, duration, estTag, inr, shortDate, time, tp } from '../utils/format';
import { useAuth } from '../store/auth';
import { useBooking } from '../store/booking';
import { toast } from '../store/ui';
import SeatMap, { seatVisual } from '../components/SeatMap';
import { Modal, SeatMapSkeleton } from '../components/Overlay';
import { Arrow, GenderPicker, PageHeader } from '../components/ui';

export type { TripDetail };

/** Elegant boarding/dropping transit summary card with timeline, road metrics, and fare breakdown */
export function TripSummary({ trip, fare }: { trip: TripDetail; fare?: { base: number; gst: number; total: number } }) {
  const { t } = useTranslation();
  const bp = trip.boarding[0];
  const dp = trip.dropping[0];

  const depDate = trip.departureTime ? new Date(trip.departureTime) : null;
  const arrDate = trip.arrivalTime ? new Date(trip.arrivalTime) : null;
  const isNextDay = depDate && arrDate && arrDate.getDate() !== depDate.getDate();

  return (
    <div className="space-y-4 rounded-2xl border-2 border-black bg-card p-4 sm:p-5 shadow-card dark:border-white">
      {/* 1. Header: Operator + Bus Type + AC Tag */}
      <div className="flex items-center justify-between border-b-2 border-black/20 pb-3 dark:border-white/20">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border-2 border-black bg-brand/10 text-brand dark:border-white">
            <LuBus size={17} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold text-ink leading-tight">{trip.operator.name}</p>
            <p className="truncate text-xs font-semibold text-ink-soft">{busTypeLabel(trip.bus.busType)}</p>
          </div>
        </div>
        {trip.bus.ac && (
          <span className="inline-flex items-center gap-1 rounded-full border-2 border-emerald-600/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
            <LuSnowflake size={12} /> AC
          </span>
        )}
      </div>

      {/* 2. Route Timeline Card (Departure -> Transit -> Arrival) */}
      <div className="rounded-xl border-2 border-black bg-surface-tint/60 p-4 space-y-3.5 dark:border-white">
        {/* Departure Station */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-emerald-600 ring-4 ring-emerald-500/20" />
            <div className="min-w-0">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-ink-soft">{t('From')}</span>
              <p className="truncate text-sm font-extrabold text-ink">{tp(trip.from.name)}</p>
              {bp?.name && (
                <p className="truncate text-xs font-medium text-ink-soft">{tp(bp.name)}</p>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-base font-black tabular-nums text-ink">{time(trip.departureTime)}</p>
            <p className="text-[11px] font-semibold text-ink-soft">{shortDate(trip.departureTime)}</p>
          </div>
        </div>

        {/* Route Connecting Line & Journey Metrics Badge */}
        <div className="relative flex items-center py-1">
          <div className="flex-1 border-t-2 border-dashed border-ink/20" />
          <div className="mx-2 flex items-center gap-2 rounded-full border-2 border-black bg-card px-3 py-1 shadow-sm text-xs font-bold text-ink dark:border-white">
            <LuClock size={13} className="text-brand shrink-0" />
            <span>{duration(trip.durationMin) ?? 'Direct Route'}</span>
            {trip.distanceKm && (
              <>
                <span className="text-ink/30">·</span>
                <span className="text-ink-soft font-semibold">{trip.distanceKm} km</span>
              </>
            )}
          </div>
          <div className="flex-1 border-t-2 border-dashed border-ink/20" />
        </div>

        {/* Arrival Station */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-brand ring-4 ring-brand/20" />
            <div className="min-w-0">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-ink-soft">{t('To')}</span>
              <p className="truncate text-sm font-extrabold text-ink">{tp(trip.to.name)}</p>
              {dp?.name && (
                <p className="truncate text-xs font-medium text-ink-soft">{tp(dp.name)}</p>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-base font-black tabular-nums text-ink">
              {trip.estimateAvailable && trip.arrivalTime ? time(trip.arrivalTime) : '—'}
            </p>
            <div className="flex items-center justify-end gap-1">
              <p className="text-[11px] font-semibold text-ink-soft">
                {trip.arrivalTime ? shortDate(trip.arrivalTime) : ''}
              </p>
              {isNextDay && (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-700 dark:text-amber-300">
                  +1 Day
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Clean Highway Routing strip (Replaced the cluttered text) */}
      <div className="flex items-center justify-between rounded-xl border-2 border-black bg-ink/[0.03] px-3.5 py-2 text-xs text-ink-soft dark:border-white">
        <span className="flex items-center gap-1.5 font-medium">
          <LuRoute size={14} className="text-brand shrink-0" />
          <span>{trip.distanceKm ? `Total distance: ${trip.distanceKm} km` : 'Scheduled Express Route'}</span>
        </span>
        {trip.estimateAvailable && (
          <span className="rounded-md bg-card px-2.5 py-0.5 text-[10px] font-bold border-2 border-black text-ink dark:border-white">
            {estTag(trip.estimateSource)}
          </span>
        )}
      </div>

      {/* 4. Fare Breakdown (when fare is provided) */}
      {fare && (
        <div className="rounded-xl border-2 border-black bg-surface-tint/50 p-3.5 space-y-2 dark:border-white">
          <div className="flex justify-between text-xs text-ink-soft">
            <span>{t('Fare')}</span>
            <span className="font-semibold text-ink">{inr(fare.base)}</span>
          </div>
          <div className="flex justify-between text-xs text-ink-soft">
            <span>{t('GST (5%)')}</span>
            <span className="font-semibold text-ink">{inr(fare.gst)}</span>
          </div>
          <div className="border-t border-dashed border-ink/15 pt-2 flex justify-between items-baseline">
            <div>
              <span className="text-sm font-black text-ink">{t('Total')}</span>
              <span className="block text-[10px] font-medium text-ink-soft">All inclusive taxes</span>
            </div>
            <span className="text-2xl font-black text-brand tracking-tight">{inr(fare.total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function fareFor(trip: TripDetail, layout: BusLayout, seatIds: string[]) {
  const types = new Map(layout.decks.flatMap((d) => d.seats.map((s) => [s.id, s.type] as const)));
  const base = seatIds.reduce((a, id) => a + (trip.fares[types.get(id) ?? 'seater'] ?? 0), 0);
  const gst = Math.round(base * 0.05);
  return { base, gst, total: base + gst };
}

export default function Seats() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const b = useBooking();
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState('');

  const trip = useQuery({ queryKey: ['trip', id], queryFn: () => tripsApi.detail(id), staleTime: 30_000 });
  const seatsQ = useQuery({ queryKey: ['seats', id], queryFn: () => tripsApi.seats(id), refetchInterval: 10_000 });

  const pax = b.pax;
  const selected = useMemo(() => Object.fromEntries(pax.filter((p) => p.seatId).map((p) => [p.seatId!, p.gender])) as Record<string, Gender>, [pax]);
  const layout = seatsQ.data?.layout;
  const seats = useMemo(() => seatsQ.data?.seats ?? {}, [seatsQ.data]);
  const activeGender: Gender | null = pax[active]?.gender ?? null;

  const anyEligible = useMemo(() => {
    if (!layout) return true;
    const genders = new Set(pax.map((p) => p.gender));
    return Object.values(seats).some((s) => ['available', 'ladies', 'waiting'].includes(seatVisual(s, false, null)) && [...genders].some((g) => s.allowedGenders.includes(g)));
  }, [layout, seats, pax]);

  // Passenger 1 is the account holder: their gender is fixed to the account's (it cannot be changed after signup).
  useEffect(() => {
    if (user && !b.holdId && b.pax[0] && b.pax[0].gender !== user.gender) b.set({ pax: b.pax.map((p, j) => (j === 0 ? { ...p, gender: user.gender, seatId: undefined } : p)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.gender, b.pax[0]?.gender]);

  function setPax(i: number, patch: Partial<{ gender: Gender; seatId?: string }>) {
    b.set({ pax: b.pax.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  }

  function toggle(seat: SeatDef) {
    const owner = b.pax.findIndex((p) => p.seatId === seat.id);
    if (owner >= 0) { setPax(owner, { seatId: undefined }); return setActive(owner); }
    const target = b.pax[active]?.seatId ? b.pax.findIndex((p) => !p.seatId) : active;
    if (target < 0) return toast.info(t('All passengers have seats. Tap a selected seat to change it.'));
    setPax(target, { seatId: seat.id });
    const next = b.pax.findIndex((p, j) => j !== target && !p.seatId);
    if (next >= 0) setActive(next);
  }

  const chosen = pax.filter((p) => p.seatId);
  const fare = trip.data && layout ? fareFor(trip.data, layout, chosen.map((p) => p.seatId!)) : undefined;
  const ready = chosen.length === pax.length;

  async function proceed() {
    setBusy(true);
    try {
      const r = await tripsApi.hold(id, { seats: chosen.map((p) => ({ seatId: p.seatId!, gender: p.gender, familyLinked: false })), replaceHoldId: b.holdId ?? undefined });
      b.set({ tripId: id, holdId: r.holdId, holdExpiresAt: r.expiresAt, pax });
      toast.success(t('Seats held for you'));
      nav(`/trip/${id}/points`);
    } catch (e) {
      b.set({ pax: b.pax.map((p) => ({ ...p, seatId: undefined })), holdId: null, holdExpiresAt: null });
      setActive(0);
      qc.invalidateQueries({ queryKey: ['seats', id] });
      setConflict(e instanceof ApiError && e.code === 'SEAT_TAKEN' ? t('Someone just booked that seat. Please pick another one.') : e instanceof ApiError && e.code === 'NOT_ELIGIBLE' ? t('One of those seats is not available for the selected passenger (seat-gender rules). Please choose different seats.') : errorMessage(e));
    } finally { setBusy(false); }
  }

  if (trip.isLoading || seatsQ.isLoading || !layout) return <div><PageHeader title={t('Select seats')} /><SeatMapSkeleton /></div>;
  if (!trip.data) return <div className="rounded-3xl border border-ink/10 bg-card p-8 text-center">{t('Trip not found.')}</div>;

  const CTA = (
    <button onClick={proceed} disabled={busy || !ready} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-black bg-brand py-4 text-base font-extrabold text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-[.98] disabled:opacity-50 dark:border-white">
      {busy ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />{t('Holding seats…')}</> : <>{t('continue')}{fare ? ` · ${inr(fare.total)}` : ''}</>}
    </button>
  );

  return (
    <div>
      <PageHeader title={t('Select seats')} subtitle={<>{tp(trip.data.from.name)}<Arrow />{tp(trip.data.to.name)}</>} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_400px] lg:items-start lg:gap-8">
        <div className="min-w-0 space-y-5">
          <div className="lg:hidden"><TripSummary trip={trip.data} /></div>

          <section className="space-y-2.5" aria-label={t('Passengers')}>
            <p className="flex items-center gap-2 font-extrabold"><LuArmchair size={16} className="text-brand" />{t('passengers')}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {pax.map((p, i) => (
                <div key={i} className={`rounded-2xl border-2 p-3 transition ${i === active ? 'border-brand bg-card shadow-card' : 'border-black/30 bg-card dark:border-white/30'}`}>
                  <button type="button" onClick={() => setActive(i)} className="mb-2.5 flex w-full items-center justify-between text-left text-sm font-extrabold">
                    <span>{i === 0 ? t('Passenger 1 (you)') : t('Passenger {{n}}', { n: i + 1 })}</span>
                    <span className={`rounded-full border border-black/30 px-3 py-0.5 text-xs ${p.seatId ? 'bg-brand text-cream' : 'bg-ink/10 text-ink-soft'}`}>{p.seatId ? t('Seat {{seat}}', { seat: p.seatId.split('-').pop() }) : t('Pick a seat')}</span>
                  </button>
                  <GenderPicker value={p.gender} locked={i === 0 && !!user} onChange={(g) => { setPax(i, { gender: g, seatId: undefined }); setActive(i); }} />
                </div>
              ))}
            </div>
            <p className="text-xs font-semibold text-ink-soft">{t('Your gender is set at signup and cannot be changed. Seats you cannot take show as unavailable (eligibility depends on gender and who sits beside you).')}</p>
          </section>

          {!anyEligible ? (
            <div className="rounded-3xl border-2 border-black bg-surface-tint p-6 text-center dark:border-white"><LuFrown size={30} className="mx-auto text-brand" /><p className="mt-2 font-extrabold">{t('noSeats')}</p></div>
          ) : (
            <SeatMap layout={layout} seats={seats} selected={selected} activeGender={activeGender} onToggle={toggle} />
          )}
        </div>

        <aside className="hidden space-y-3 lg:sticky lg:top-24 lg:block">
          <TripSummary trip={trip.data} fare={chosen.length ? fare : undefined} />
          {CTA}
          <p className="text-center text-xs font-semibold text-ink-soft">{t('Boarding')} {time(trip.data.boarding[0]?.time)} {t('· Cancellation fee')} {inr(trip.data.operator.cancellationFee)}</p>
        </aside>
      </div>

      {/* phone: sticky total + continue */}
      <div className="sticky bottom-3 z-20 mt-5 flex items-center gap-3 rounded-3xl border-2 border-black bg-white p-3 pl-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] lg:hidden dark:border-white dark:bg-zinc-900">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold text-ink-soft">{chosen.length}/{pax.length} {t('Seats').toLowerCase()}{chosen.length ? ` · ${chosen.map((p) => p.seatId!.split('-').pop()).join(', ')}` : ''}</p>
          <p className="text-xl font-extrabold text-brand">{fare ? inr(fare.total) : inr(0)}</p>
        </div>
        <button onClick={proceed} disabled={busy || !ready} className="rounded-xl border-2 border-black bg-brand px-7 py-3 text-sm font-extrabold text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-95 disabled:opacity-50 dark:border-white">{busy ? t('Holding…') : t('continue')}</button>
      </div>

      <Modal open={!!conflict} onClose={() => setConflict('')} title={t('Seat not available')}>
        <p className="text-sm font-semibold text-ink-soft">{conflict}</p>
        <button onClick={() => setConflict('')} className="mt-4 w-full rounded-xl border-2 border-black bg-brand py-3.5 font-extrabold text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-95">{t('Choose again')}</button>
      </Modal>
    </div>
  );
}
