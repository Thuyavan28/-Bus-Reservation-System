import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LuActivity, LuBus, LuChevronRight, LuCircleDollarSign,
  LuClock, LuMapPin, LuNavigation, LuTicket, LuTrendingUp, LuUsers, LuX,
  LuArrowRight, LuRefreshCw,
} from 'react-icons/lu';
import { catalogApi, errorMessage, operatorApi, paymentsApi } from '../utils/api';
import { dateTime, inr } from '../utils/format';
import { useAuth } from '../store/auth';
import LayoutBuilder from '../components/LayoutBuilder';
import { Button, Card, ErrorText, Field, inputCls, PageHeader, Spinner, StatusPill } from '../components/ui';

const TABS = ['Dashboard', 'Policy', 'Buses & layouts', 'Trips', 'Payments', 'Cancellations', 'Refunds', 'Bookings'] as const;

export default function Operator() {
  const user = useAuth((s) => s.user)!;
  const [tab, setTab] = useState<(typeof TABS)[number]>('Dashboard');
  const [opId, setOpId] = useState('');
  const ops = useQuery({ queryKey: ['ops'], queryFn: () => operatorApi.operators(), enabled: user.role === 'admin' });
  const qs = user.role === 'admin' && opId ? `?operatorId=${opId}` : '';
  const needOp = user.role === 'admin' && !opId;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageHeader to="/profile" title="Operator Dashboard" subtitle="Overview, buses, trips and payments" />
        {user.role === 'admin' && (
          <select
            className="rounded-xl border-2 border-ink/15 bg-card px-3 py-2 text-sm font-semibold"
            value={opId}
            onChange={(e) => setOpId(e.target.value)}
            aria-label="Operator"
          >
            <option value="">Select operator…</option>
            {ops.data?.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}
          </select>
        )}
      </div>

      {/* Tab bar */}
      <div className="-mx-4 overflow-x-auto px-4 no-scrollbar">
        <div className="flex w-max gap-1 rounded-full border border-ink/10 bg-ink/5 p-1.5">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`whitespace-nowrap shrink-0 rounded-full px-4 py-2 text-sm font-extrabold transition-all duration-200
                ${tab === t ? 'bg-brand text-cream shadow-md scale-[1.04]' : 'text-ink-soft hover:text-ink'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {needOp ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-brand"><LuUsers size={26} /></span>
            <p className="font-extrabold text-lg">Select an operator to manage</p>
            <p className="text-sm text-ink-soft">Use the dropdown above to pick an operator and view their dashboard.</p>
          </div>
        </Card>
      ) : (
        <>
          {tab === 'Dashboard'      && <DashboardTab qs={qs} />}
          {tab === 'Policy'         && <PolicyTab qs={qs} />}
          {tab === 'Buses & layouts' && <BusesTab qs={qs} />}
          {tab === 'Trips'          && <TripsTab qs={qs} />}
          {tab === 'Payments'       && <PaymentsTab qs={qs} />}
          {tab === 'Cancellations'  && <CancellationsTab qs={qs} />}
          {tab === 'Refunds'        && <RefundsTab qs={qs} />}
          {tab === 'Bookings'       && <BookingsTab qs={qs} />}
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   DASHBOARD TAB — stats + bus tracking
═══════════════════════════════════════════════ */
function DashboardTab({ qs }: { qs: string }) {
  const trips     = useQuery({ queryKey: ['otrips', qs],      queryFn: () => operatorApi.trips(qs),            refetchInterval: 30_000 });
  const bookings  = useQuery({ queryKey: ['obook', qs],       queryFn: () => operatorApi.bookings(qs),         refetchInterval: 30_000 });
  const cancels   = useQuery({ queryKey: ['ocancel', qs],     queryFn: () => operatorApi.cancellations(qs),    refetchInterval: 30_000 });
  const payments  = useQuery({ queryKey: ['pending-pay', qs], queryFn: () => operatorApi.pendingPayments(qs),  refetchInterval: 15_000 });

  const allBookings   = bookings.data ?? [];
  const allCancels    = cancels.data ?? [];
  const allTrips      = trips.data ?? [];
  const bookedCount   = allBookings.filter((b: any) => b.status === 'booked').length;
  const cancelCount   = allCancels.length;
  const pendingPay    = payments.data?.length ?? 0;
  const revenue       = allBookings.filter((b: any) => b.status === 'booked').reduce((s: number, b: any) => s + (b.total ?? 0), 0);
  const activeTrips   = allTrips.filter((t: any) => t.status === 'running' || t.status === 'scheduled');

  const isLoading = trips.isLoading || bookings.isLoading || cancels.isLoading;

  return (
    <div className="space-y-5">
      {/* ── Stats cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          Icon={LuTicket}
          label="Total Bookings"
          value={String(allBookings.length)}
          sub={`${bookedCount} confirmed`}
          tone="brand"
          loading={isLoading}
        />
        <StatCard
          Icon={LuActivity}
          label="Booked Seats"
          value={String(bookedCount)}
          sub="Active passengers"
          tone="green"
          loading={isLoading}
        />
        <StatCard
          Icon={LuX}
          label="Cancellations"
          value={String(cancelCount)}
          sub="All time"
          tone="red"
          loading={isLoading}
        />
        <StatCard
          Icon={LuCircleDollarSign}
          label="Revenue"
          value={revenue > 0 ? inr(revenue) : '—'}
          sub={`${pendingPay} pending`}
          tone="purple"
          loading={isLoading}
        />
      </div>

      {/* ── Secondary row ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard Icon={LuBus}        label="Total Trips"   value={String(allTrips.length)} sub="Scheduled & past" tone="teal" loading={isLoading} />
        <StatCard Icon={LuActivity}   label="Active Trips"  value={String(activeTrips.length)} sub="Now running" tone="amber" loading={isLoading} />
        <StatCard Icon={LuTrendingUp} label="Completion"
          value={allTrips.length ? `${Math.round(allTrips.filter((t: any) => t.status === 'completed').length / allTrips.length * 100)}%` : '—'}
          sub="Trips completed"
          tone="ink"
          loading={isLoading}
        />
      </div>

      {/* ── Booking vs Cancellation bar ── */}
      {!isLoading && (allBookings.length > 0 || cancelCount > 0) && (
        <Card className="space-y-3">
          <p className="font-extrabold flex items-center gap-2"><LuTrendingUp size={17} className="text-brand" /> Booking Overview</p>
          <div className="flex gap-4 text-sm font-semibold">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-brand inline-block" />Booked ({bookedCount})</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-red-400 inline-block" />Cancelled ({cancelCount})</span>
          </div>
          <div className="h-4 w-full overflow-hidden rounded-full bg-ink/10 flex">
            {bookedCount > 0 && (
              <div
                className="h-full bg-brand rounded-l-full transition-all duration-700"
                style={{ width: `${Math.round(bookedCount / (bookedCount + cancelCount) * 100)}%` }}
              />
            )}
            {cancelCount > 0 && (
              <div
                className="h-full bg-red-400 rounded-r-full transition-all duration-700"
                style={{ width: `${Math.round(cancelCount / (bookedCount + cancelCount) * 100)}%` }}
              />
            )}
          </div>
          <p className="text-xs text-ink-soft">
            Total {allBookings.length} booking records · {cancelCount} cancellation requests
          </p>
        </Card>
      )}

      {/* ── Live Bus Tracking ── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-extrabold flex items-center gap-2 text-base">
            <LuNavigation size={17} className="text-brand" /> Live Bus Tracking
          </h2>
          <button onClick={() => trips.refetch()} className="flex items-center gap-1 rounded-full border border-ink/15 bg-card px-3 py-1.5 text-xs font-bold transition hover:bg-ink/5 active:scale-95">
            <LuRefreshCw size={12} /> Refresh
          </button>
        </div>

        {trips.isLoading && <Spinner label="Loading trips…" />}

        {!trips.isLoading && allTrips.length === 0 && (
          <Card>
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ink/5 text-ink-soft"><LuBus size={22} /></span>
              <p className="text-sm text-ink-soft">No trips scheduled yet.</p>
            </div>
          </Card>
        )}

        <div className="space-y-3">
          {allTrips.map((t: any) => <BusTrackCard key={t.id} trip={t} />)}
        </div>
      </div>

      {/* ── Recent bookings ── */}
      {allBookings.length > 0 && (
        <div>
          <h2 className="mb-3 font-extrabold flex items-center gap-2 text-base">
            <LuUsers size={17} className="text-brand" /> Recent Bookings
          </h2>
          <div className="space-y-2">
            {allBookings.slice(0, 6).map((b: any) => (
              <Card key={b.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
                    <LuTicket size={16} />
                  </span>
                  <div>
                    <p className="font-bold">PNR {b.pnr}</p>
                    <p className="text-xs text-ink-soft">{b.passengers?.join(', ')} · {b.contact?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-extrabold text-brand">{inr(b.total)}</span>
                  <StatusPill status={b.status} />
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent cancellations ── */}
      {allCancels.length > 0 && (
        <div>
          <h2 className="mb-3 font-extrabold flex items-center gap-2 text-base">
            <LuX size={17} className="text-brand" /> Recent Cancellations
          </h2>
          <div className="space-y-2">
            {allCancels.slice(0, 4).map((c: any) => (
              <Card key={c._id} className="text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-50 text-red-500">
                      <LuX size={16} />
                    </span>
                    <div>
                      <p className="font-bold">PNR {c.pnr}</p>
                      <p className="text-xs text-ink-soft">
                        Ticket {inr(c.ticketAmount)} · Fee {inr(c.fee)} · Refund {inr(c.refundAmount)}
                      </p>
                    </div>
                  </div>
                  <StatusPill status={c.status} />
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Stat card ── */
const TONE_MAP: Record<string, { bg: string; text: string; ring: string }> = {
  brand:  { bg: 'bg-brand/10',   text: 'text-brand',     ring: 'ring-brand/20' },
  green:  { bg: 'bg-green-50',   text: 'text-green-600', ring: 'ring-green-200' },
  red:    { bg: 'bg-red-50',     text: 'text-red-500',   ring: 'ring-red-200' },
  purple: { bg: 'bg-purple-50',  text: 'text-purple-600',ring: 'ring-purple-200' },
  teal:   { bg: 'bg-teal-50',    text: 'text-teal-600',  ring: 'ring-teal-200' },
  amber:  { bg: 'bg-amber-50',   text: 'text-amber-600', ring: 'ring-amber-200' },
  ink:    { bg: 'bg-ink/8',      text: 'text-ink',       ring: 'ring-ink/10' },
};

function StatCard({ Icon, label, value, sub, tone, loading }: {
  Icon: any; label: string; value: string; sub: string; tone: string; loading?: boolean;
}) {
  const c = TONE_MAP[tone] ?? TONE_MAP.brand;
  return (
    <Card className="flex flex-col gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between">
        <span className={`grid h-10 w-10 place-items-center rounded-2xl ring-4 ${c.bg} ${c.text} ${c.ring}`}>
          <Icon size={20} />
        </span>
      </div>
      {loading ? (
        <div className="space-y-2">
          <div className="skeleton h-7 w-16" />
          <div className="skeleton h-3 w-24" style={{ '--d': '0.15s' } as any} />
        </div>
      ) : (
        <>
          <p className="text-2xl font-extrabold leading-none">{value}</p>
          <p className="text-xs font-semibold text-ink-soft">{sub}</p>
        </>
      )}
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft/70">{label}</p>
    </Card>
  );
}

/* ── Bus track card ── */
function BusTrackCard({ trip }: { trip: any }) {
  const isRunning   = trip.status === 'running';
  const isScheduled = trip.status === 'scheduled';
  const isDone      = trip.status === 'completed' || trip.status === 'cancelled';

  const statusColor = isRunning ? 'bg-green-500' : isScheduled ? 'bg-amber-400' : 'bg-ink/30';

  return (
    <Card className="transition-all duration-200 hover:shadow-md">
      <div className="flex flex-wrap items-center gap-3">
        {/* Bus icon with live pulse */}
        <div className="relative shrink-0">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand">
            <LuBus size={22} />
          </span>
          {isRunning && (
            <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-green-500">
              <span className="absolute h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
            </span>
          )}
        </div>

        {/* Route */}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-extrabold">
            <LuMapPin size={13} className="shrink-0 text-brand" />
            <span className="truncate">{trip.from}</span>
            <LuArrowRight size={13} className="shrink-0 text-ink-soft" />
            <span className="truncate">{trip.to}</span>
          </p>
          <p className="mt-0.5 text-xs text-ink-soft flex items-center gap-1.5">
            <LuClock size={12} /> {dateTime(trip.departureTime)}
            {trip.fares?.seater && <span>· {inr(trip.fares.seater)} seater</span>}
          </p>
        </div>

        {/* Status pill + indicator */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={`h-2.5 w-2.5 rounded-full ${statusColor} ${isRunning ? 'animate-pulse' : ''}`} />
          <StatusPill status={trip.status} />
        </div>
      </div>

      {/* Progress bar for running trips */}
      {isRunning && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] font-semibold text-ink-soft mb-1">
            <span>In transit</span>
            <span className="text-green-600 font-extrabold">LIVE</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink/10">
            <div
              className="h-full rounded-full bg-brand transition-all duration-500"
              style={{
                width: '60%',
                background: 'linear-gradient(90deg, #FF1840 0%, #ff6680 100%)',
                boxShadow: '0 0 8px rgba(255,24,64,0.4)',
                animation: 'busProgress 3s ease-in-out infinite alternate',
              }}
            />
          </div>
          <style>{`
            @keyframes busProgress {
              from { width: 55%; }
              to   { width: 65%; }
            }
          `}</style>
        </div>
      )}

      {isDone && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-ink/5 px-3 py-2 text-xs font-semibold text-ink-soft">
          <LuActivity size={13} className={trip.status === 'completed' ? 'text-green-500' : 'text-red-400'} />
          {trip.status === 'completed' ? 'Trip completed successfully' : 'Trip was cancelled'}
        </div>
      )}
    </Card>
  );
}

/* ═══════════════════════════════════════════════
   POLICY TAB
═══════════════════════════════════════════════ */
function PolicyTab({ qs }: { qs: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['policy', qs], queryFn: () => operatorApi.policy(qs) });
  const [p, setP] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const cur = p ?? q.data?.policy;
  const save = useMutation({
    mutationFn: () => operatorApi.savePolicy({ cancellationFee: +cur.cancellationFee, cutoffHoursBeforeDeparture: +cur.cutoffHoursBeforeDeparture, fallbackPolicy: cur.fallbackPolicy, standardRefundPercent: +cur.standardRefundPercent, holdMinutes: +cur.holdMinutes, gender: cur.gender }, qs),
    onSuccess: () => { setMsg('Saved'); qc.invalidateQueries({ queryKey: ['policy'] }); },
    onError: (e) => setMsg(errorMessage(e)),
  });
  if (!cur) return <Spinner />;
  const set = (k: string, v: any) => setP({ ...cur, [k]: v });
  const setG = (k: string, v: boolean) => setP({ ...cur, gender: { ...cur.gender, [k]: v } });
  return (
    <div className="grid grid-cols-1 gap-4">
      <Card className="space-y-3">
        <p className="font-extrabold">Cancellation &amp; refunds</p>
        <Field label="Cancellation fee (₹)"><input className={inputCls} type="number" value={cur.cancellationFee} onChange={(e) => set('cancellationFee', e.target.value)} /></Field>
        <Field label="Cutoff (hours before departure)"><input className={inputCls} type="number" value={cur.cutoffHoursBeforeDeparture} onChange={(e) => set('cutoffHoursBeforeDeparture', e.target.value)} /></Field>
        <Field label="Fallback when no replacement books">
          <select className={inputCls} value={cur.fallbackPolicy} onChange={(e) => set('fallbackPolicy', e.target.value)}><option value="standard_terms">Apply standard terms</option><option value="reject">Reject the cancellation</option></select>
        </Field>
        <Field label="Standard-terms refund (% of ticket)"><input className={inputCls} type="number" value={cur.standardRefundPercent} onChange={(e) => set('standardRefundPercent', e.target.value)} /></Field>
        <Field label="Seat hold (minutes, 5–10)"><input className={inputCls} type="number" min={5} max={10} value={cur.holdMinutes} onChange={(e) => set('holdMinutes', e.target.value)} /></Field>
      </Card>
      <Card className="space-y-3">
        <p className="font-extrabold">Gender seat policy</p>
        {([['enforce', 'Enforce adjacent-seat gender rules'], ['femaleAdjacentRestricted', 'Seat beside a woman is women-only'], ['allowSameBookingAdjacent', 'Allow mixed adjacent seats within one booking (e.g. husband & wife)']] as const).map(([k, l]) => (
          <label key={k} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={!!cur.gender[k]} onChange={(e) => setG(k, e.target.checked)} />{l}</label>
        ))}
        <p className="text-xs text-ink-soft">A man always makes the neighbouring seat men-only while he holds it.</p>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Save policy</Button>
        <ErrorText>{msg}</ErrorText>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   BUSES TAB
═══════════════════════════════════════════════ */
function BusesTab({ qs }: { qs: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['buses', qs], queryFn: () => operatorApi.buses(qs) });
  const [edit, setEdit] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const save = useMutation({
    mutationFn: () => (edit._id ? operatorApi.updateBus(edit._id, payload(edit), qs) : operatorApi.createBus(payload(edit), qs)),
    onSuccess: () => { setEdit(null); setMsg(''); qc.invalidateQueries({ queryKey: ['buses'] }); },
    onError: (e) => setMsg(errorMessage(e)),
  });
  const payload = (b: any) => ({ name: b.name, registration: b.registration, busType: b.layout.busType, ac: b.ac, amenities: b.amenities ?? [], layout: b.layout });
  async function create() {
    const layout = await operatorApi.layoutPreview({ busType: 'seater', rows: 10 });
    setEdit({ name: '', registration: '', ac: true, layout });
  }
  if (q.isLoading) return <Spinner />;
  return (
    <div className="space-y-3">
      {!edit && <Button onClick={create}>+ New bus</Button>}
      {!edit && q.data?.map((b) => (
        <Card key={b._id} className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand/10 text-brand"><LuBus size={18} /></span>
            <div>
              <p className="font-bold">{b.name} <span className="text-xs capitalize text-ink-soft">({b.busType})</span></p>
              <p className="text-xs text-ink-soft">{b.registration} · {b.layout.decks.reduce((a: number, d: any) => a + d.seats.length, 0)} seats · {b.layout.decks.length} deck(s)</p>
            </div>
          </div>
          <Button variant="ghost" onClick={() => setEdit(JSON.parse(JSON.stringify(b)))}>Edit layout</Button>
        </Card>
      ))}
      {edit && (
        <Card className="space-y-3">
          <div className="grid grid-cols-1 gap-3">
            <Field label="Bus name"><input className={inputCls} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Registration"><input className={inputCls} value={edit.registration} onChange={(e) => setEdit({ ...edit, registration: e.target.value })} /></Field>
            <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={edit.ac} onChange={(e) => setEdit({ ...edit, ac: e.target.checked })} /> Air-conditioned</label>
          </div>
          <LayoutBuilder value={edit.layout} onChange={(layout) => setEdit({ ...edit, layout })} />
          <ErrorText>{msg}</ErrorText>
          <div className="flex gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending || !edit.name || !edit.registration}>Save bus</Button>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TRIPS TAB
═══════════════════════════════════════════════ */
function TripsTab({ qs }: { qs: string }) {
  const qc = useQueryClient();
  const trips  = useQuery({ queryKey: ['otrips', qs],  queryFn: () => operatorApi.trips(qs) });
  const buses  = useQuery({ queryKey: ['buses', qs],   queryFn: () => operatorApi.buses(qs) });
  const cities = useQuery({ queryKey: ['cities'],       queryFn: () => catalogApi.cities() });
  const [f, setF] = useState({ busId: '', fromCityId: '', toCityId: '', departureTime: '', seater: 450, sleeper: 950 });
  const [msg, setMsg] = useState('');
  const create = useMutation({
    mutationFn: () => operatorApi.createTrip({ busId: f.busId, fromCityId: f.fromCityId, toCityId: f.toCityId, departureTime: new Date(f.departureTime).toISOString(), fares: { seater: +f.seater, sleeper: +f.sleeper } }, qs),
    onSuccess: () => { setMsg('Trip created'); qc.invalidateQueries({ queryKey: ['otrips'] }); },
    onError: (e) => setMsg(errorMessage(e)),
  });
  const cancel = useMutation({ mutationFn: (id: string) => operatorApi.cancelTrip(id, qs), onSuccess: () => qc.invalidateQueries({ queryKey: ['otrips'] }) });
  const sel = (k: 'busId' | 'fromCityId' | 'toCityId', opts: any[], label: string) => (
    <select className={inputCls} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} aria-label={label}><option value="">{label}</option>{opts.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}</select>
  );
  return (
    <div className="grid grid-cols-1 gap-4">
      <Card className="space-y-2">
        <p className="font-extrabold">Schedule a trip</p>
        {sel('busId', buses.data ?? [], 'Bus')}
        {sel('fromCityId', cities.data ?? [], 'From')}
        {sel('toCityId', (cities.data ?? []).filter((c) => c._id !== f.fromCityId), 'To')}
        <input className={inputCls} type="datetime-local" value={f.departureTime} onChange={(e) => setF({ ...f, departureTime: e.target.value })} aria-label="Departure" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Seater fare ₹"><input className={inputCls} type="number" value={f.seater} onChange={(e) => setF({ ...f, seater: +e.target.value })} /></Field>
          <Field label="Sleeper fare ₹"><input className={inputCls} type="number" value={f.sleeper} onChange={(e) => setF({ ...f, sleeper: +e.target.value })} /></Field>
        </div>
        <Button disabled={!f.busId || !f.fromCityId || !f.toCityId || !f.departureTime || create.isPending} onClick={() => create.mutate()}>Create trip</Button>
        <ErrorText>{msg}</ErrorText>
      </Card>
      <div className="space-y-2">
        {trips.data?.map((t) => (
          <Card key={t.id} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand/10 text-brand shrink-0"><LuBus size={16} /></span>
              <div>
                <p className="font-bold">{t.from} <LuChevronRight className="inline" size={12} /> {t.to}</p>
                <p className="text-xs text-ink-soft">{dateTime(t.departureTime)} · {inr(t.fares.seater || t.fares.sleeper)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusPill status={t.status} />
              {t.status === 'scheduled' && <button className="text-xs font-bold text-red-600 hover:underline" onClick={() => confirm('Cancel this trip?') && cancel.mutate(t.id)}>Cancel</button>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PAYMENTS TAB
═══════════════════════════════════════════════ */
function PaymentsTab({ qs }: { qs: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['pending-pay', qs], queryFn: () => operatorApi.pendingPayments(qs), refetchInterval: 10_000 });
  const approve = useMutation({ mutationFn: (ref: string) => paymentsApi.approve(ref), onSuccess: () => qc.invalidateQueries({ queryKey: ['pending-pay'] }) });
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-soft">Payments awaiting approval from the external payment site. Approving places the order and emails the ticket.</p>
      {!q.data?.length && <Card className="text-center text-ink-soft py-6">No pending payments. ✅</Card>}
      {q.data?.map((p) => (
        <Card key={p.reference} className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-600 shrink-0"><LuCircleDollarSign size={16} /></span>
            <div><p className="font-bold">{p.reference}</p><p className="text-xs text-ink-soft">PNR {p.pnr} · {inr(p.amount)}</p></div>
          </div>
          <Button onClick={() => approve.mutate(p.reference)} disabled={approve.isPending}>Approve</Button>
        </Card>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   CANCELLATIONS TAB
═══════════════════════════════════════════════ */
function CancellationsTab({ qs }: { qs: string }) {
  const q = useQuery({ queryKey: ['ocancel', qs], queryFn: () => operatorApi.cancellations(qs), refetchInterval: 15_000 });
  return (
    <div className="space-y-2">
      {!q.data?.length && <Card className="text-center text-ink-soft py-6">No cancellation requests. ✅</Card>}
      {q.data?.map((c) => (
        <Card key={c._id} className="text-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-red-50 text-red-500 shrink-0"><LuX size={16} /></span>
              <div>
                <p className="font-bold">PNR {c.pnr}</p>
                <p className="text-xs text-ink-soft">Ticket {inr(c.ticketAmount)} · fee {inr(c.fee)} · refund {inr(c.refundAmount)}</p>
                <p className="text-xs text-ink-soft">Cutoff {dateTime(c.cutoffAt)}</p>
              </div>
            </div>
            <StatusPill status={c.status} />
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   REFUNDS TAB
═══════════════════════════════════════════════ */
function RefundsTab({ qs }: { qs: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['orefunds', qs], queryFn: () => operatorApi.refunds(qs), refetchInterval: 15_000 });
  const done = useMutation({ mutationFn: (ref: string) => operatorApi.completeRefund(ref, qs), onSuccess: () => qc.invalidateQueries({ queryKey: ['orefunds'] }) });
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-soft">Refunds are paid through the external payment site and confirmed by its webhook.</p>
      {!q.data?.length && <Card className="text-center text-ink-soft py-6">No refunds. ✅</Card>}
      {q.data?.map((r) => (
        <Card key={r._id} className="flex items-center justify-between text-sm">
          <div>
            <p className="font-bold">{r.reference} · PNR {r.pnr}</p>
            <p className="text-xs text-ink-soft">{inr(r.ticketAmount)} − {inr(r.deduction)} = <b>{inr(r.amount)}</b></p>
          </div>
          {r.status === 'processing'
            ? <Button variant="ghost" onClick={() => done.mutate(r.reference)}>Mark completed</Button>
            : <StatusPill status={r.status === 'completed' ? 'refund_completed' : r.status} />}
        </Card>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   BOOKINGS TAB
═══════════════════════════════════════════════ */
function BookingsTab({ qs }: { qs: string }) {
  const q = useQuery({ queryKey: ['obook', qs], queryFn: () => operatorApi.bookings(qs) });
  return (
    <div className="space-y-2">
      {!q.data?.length && <Card className="text-center text-ink-soft py-6">No bookings yet.</Card>}
      {q.data?.map((b) => (
        <Card key={b.id} className="text-sm">
          <div className="flex justify-between">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand/10 text-brand shrink-0"><LuTicket size={16} /></span>
              <div>
                <p className="font-bold">PNR {b.pnr} · {inr(b.total)}</p>
                <p className="text-xs text-ink-soft">{b.passengers.join(', ')} · {b.contact?.email}</p>
              </div>
            </div>
            <StatusPill status={b.status} />
          </div>
        </Card>
      ))}
    </div>
  );
}
