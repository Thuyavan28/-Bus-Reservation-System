import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LuArrowUpDown, LuBell, LuBus, LuCalendarDays,
  LuCircleDot, LuLocateFixed, LuMapPin, LuMinus,
  LuNavigation, LuPlus, LuRadar, LuRoute,
  LuSearch, LuShieldCheck, LuTag, LuUsers,
} from 'react-icons/lu';
import { catalogApi, errorMessage, type Place } from '../utils/api';
import { isoPlus, loc, tp } from '../utils/format';
import { useAuth } from '../store/auth';
import { useBooking } from '../store/booking';
import { toast } from '../store/ui';
import MapLazy, { type MapMarker } from '../components/MapLazy';
import { useMedia } from '../utils/useMedia';
import PlaceInput from '../components/PlaceInput';
const RouteTransition = lazy(() => import('../components/RouteTransition'));
import { Arrow } from '../components/ui';
import { Skeleton } from '../components/Overlay';

const asRef = (p: Place) => ({ id: p.id, name: p.name, slug: p.slug });
const blank = (r: { id: string; name: string; slug: string }): Place => ({ ...r, state: '', lat: 0, lng: 0 });

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export default function Home() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const user = useAuth((s) => s.user);
  const b = useBooking();
  const [fromText, setFromText] = useState(b.from?.name ? tp(b.from.name) : '');
  const [toText, setToText] = useState(b.to?.name ? tp(b.to.name) : '');
  const [from, setFrom] = useState<Place | null>(b.from ? blank(b.from) : null);
  const [to, setTo] = useState<Place | null>(b.to ? blank(b.to) : null);
  const [popupRoute, setPopupRoute] = useState<{ from: Place; to: Place } | null>(
    b.from && b.to ? { from: blank(b.from), to: blank(b.to) } : null,
  );
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState('');
  const [near, setNear] = useState<{ user: { lat: number; lng: number }; points: any[] } | null>(null);
  const [popup, setPopup] = useState(false);
  const [resolving, setResolving] = useState(false);

  // Keep local inputs in sync when store hydrates or has route saved
  useEffect(() => {
    if (b.from && !fromText.trim()) {
      setFrom(blank(b.from));
      setFromText(tp(b.from.name));
    }
  }, [b.from?.id, b.from?.name]);

  useEffect(() => {
    if (b.to && !toText.trim()) {
      setTo(blank(b.to));
      setToText(tp(b.to.name));
    }
  }, [b.to?.id, b.to?.name]);

  const handleSwap = () => {
    const [ft, tt, f, c] = [fromText, toText, from, to];
    setFromText(tt);
    setToText(ft);
    setFrom(c);
    setTo(f);
    b.swap();
  };

  const cities = useQuery({ queryKey: ['cities'], queryFn: catalogApi.cities, staleTime: Infinity });
  const popular = useQuery({ queryKey: ['popular'], queryFn: catalogApi.popularRoutes, staleTime: Infinity });
  const offers = useQuery({ queryKey: ['offers'], queryFn: catalogApi.offers, staleTime: Infinity });

  function locate() {
    setGeoMsg('');
    if (!('geolocation' in navigator)) return setGeoMsg(t('Location is not supported here. Type your city instead.'));
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await catalogApi.nearest(pos.coords.latitude, pos.coords.longitude);
          const p: Place = { id: r.city.id, name: r.city.name, slug: r.city.slug, state: '', lat: r.city.lat, lng: r.city.lng };
          setFrom(p);
          setFromText(tp(p.name));
          b.set({ from: asRef(p) });
          setNear({ user: { lat: pos.coords.latitude, lng: pos.coords.longitude }, points: r.boardingPoints });
          setGeoMsg(r.withinServiceArea
            ? `${t('Nearest: {{city}} ({{km}} km)', { city: tp(r.city.name), km: r.distanceToCityKm })}${r.address ? ` · ${r.address}` : ''}`
            : t('You are {{km}} km from {{city}}. Type another city if needed.', { km: r.distanceToCityKm, city: tp(r.city.name) }));
        } catch { setGeoMsg(t('Could not look up your nearest city. Type it instead.')); }
        finally { setGeoBusy(false); }
      },
      (err) => {
        setGeoBusy(false);
        setGeoMsg(err.code === err.PERMISSION_DENIED
          ? t('Location permission denied. Just type your city.')
          : t('Could not get your location. Type your city instead.'));
      },
      { timeout: 10000 },
    );
  }

  async function search(f = from, tt = to, ft = fromText, tx = toText) {
    setResolving(true);
    try {
      const [a, c] = await Promise.all([f ?? catalogApi.resolve(ft), tt ?? catalogApi.resolve(tx)]);
      if (a.id === c.id) return toast.error(t('Choose two different places.'));
      setFrom(a);
      setTo(c);
      setFromText(tp(a.name));
      setToText(tp(c.name));
      b.set({
        from: asRef(a),
        to: asRef(c),
        ...(user ? { pax: b.pax.map((p, i) => (i === 0 ? { gender: user.gender } : p)) } : {}),
      });
      setPopupRoute({ from: a, to: c });
      // Show the animated route transition (bus drives from→to on the real map)
      setPopup(true);
    } catch (e: any) {
      toast.error(e?.message ? errorMessage(e) : t('Type a valid source and destination.'));
    } finally { setResolving(false); }
  }

  const markers: MapMarker[] = useMemo(() => near
    ? [{ id: 'me', ...near.user, kind: 'user' as const, title: t('You are here') }, ...near.points.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, kind: 'boarding' as const, title: `${p.name} · ${p.distanceKm} km` }))]
    : (cities.data ?? []).map((c) => ({ id: c.slug, lat: c.lat, lng: c.lng, kind: 'city' as const, title: tp(c.name) })), [near, cities.data, t]);

  const desktop = useMedia('(min-width: 1024px)');
  const dateRef = useRef<HTMLInputElement>(null);
  const customDate = b.date !== isoPlus(0) && b.date !== isoPlus(1);
  const pickedLabel = new Date(`${b.date}T00:00:00+05:30`).toLocaleDateString(loc(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  const pick = (r: { from: any; to: any }) => {
    const f = blank({ id: r.from._id, name: r.from.name, slug: r.from.slug });
    const x = blank({ id: r.to._id, name: r.to.name, slug: r.to.slug });
    setFromText(tp(f.name));
    setToText(tp(x.name));
    setFrom(f);
    setTo(x);
    b.set({ from: asRef(f), to: asRef(x) });
    setPopupRoute({ from: f, to: x });
    setPopup(true);
  };

  /* ══════════════════════════════════════════
     MOBILE  (< lg)
  ══════════════════════════════════════════ */
  const headerDateStr = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  /* ══════════════════════════════════════════
     MOBILE  (< lg) — Matching Image 2 Design
  ══════════════════════════════════════════ */
  const Mobile = (
    <div className="flex min-h-screen flex-col bg-[#f7f7fb] lg:hidden">
      {/* ── RED HEADER & FRAMING CONTAINER ── */}
      <div className="rounded-b-[2.5rem] bg-brand px-4 pb-6 pt-10 text-white shadow-lg">
        {/* Top Header Row */}
        <div className="flex items-start justify-between pb-4">
          <div>
            <p className="text-xs font-bold text-white/85 tracking-wide">
              {headerDateStr}
            </p>
            <h1 className="mt-1 text-2xl font-black leading-tight text-white">
              Where do you want to go?
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <button
                onClick={() => nav('/profile')}
                className="grid h-10 w-10 place-items-center rounded-full bg-white/20 text-sm font-black text-white shadow-sm backdrop-blur-sm transition active:scale-95"
              >
                {user.name[0]?.toUpperCase()}
              </button>
            ) : (
              <button
                onClick={() => nav('/login', { state: { from: '/home' } })}
                className="rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-black text-white shadow-sm backdrop-blur-sm transition active:scale-95"
              >
                {t('login')}
              </button>
            )}

            <button
              aria-label="Notifications"
              className="relative grid h-10 w-10 place-items-center rounded-full bg-white/20 text-white shadow-sm backdrop-blur-sm transition active:scale-95"
            >
              <LuBell size={18} />
              <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full border border-brand bg-amber-400" />
            </button>
          </div>
        </div>

        {/* ── WHITE SEARCH CARD (Neo-brutalist rounded-3xl border-2 border-black shadow-[4px_4px_0px_#000]) ── */}
        <div className="rounded-3xl border-2 border-black bg-white p-5 text-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          {/* One Way / Round Trip Tabs */}
          <div className="mb-4 flex items-center gap-2">
            <button
              type="button"
              className="rounded-xl border-2 border-black bg-brand px-7 py-2.5 text-sm font-black text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition active:scale-95"
            >
              One Way
            </button>
            <button
              type="button"
              className="rounded-xl border-2 border-black bg-white px-4 py-2.5 text-sm font-bold text-gray-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:bg-gray-50 active:scale-95"
            >
              Round Trip
            </button>
          </div>

          {/* FROM field */}
          <div className="rounded-2xl border-2 border-black bg-gray-50/90 p-3.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border-2 border-black bg-gray-200/70 text-gray-700">
                <LuCircleDot size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">FROM</p>
                <PlaceInput
                  label=""
                  text={fromText}
                  onText={(val) => {
                    setFromText(val);
                    if (!val.trim()) {
                      setFrom(null);
                      b.set({ from: null });
                    }
                  }}
                  place={from}
                  onPlace={(p) => {
                    setFrom(p);
                    if (p) b.set({ from: asRef(p) });
                  }}
                  placeholder="Select departure city"
                  className="!border-0 !bg-transparent !p-0 !shadow-none focus-within:!ring-0"
                  trailing={
                    <button
                      type="button"
                      onClick={locate}
                      disabled={geoBusy}
                      aria-label={t('useMyLocation')}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border-2 border-black bg-red-100 text-brand shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition active:scale-95 disabled:opacity-50"
                    >
                      {geoBusy ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
                      ) : (
                        <LuLocateFixed size={16} />
                      )}
                    </button>
                  }
                />
              </div>
            </div>
          </div>

          {/* Swap Button */}
          <div className="relative -my-3 z-10 flex justify-end pr-6">
            <button
              type="button"
              aria-label={t('Swap')}
              onClick={handleSwap}
              className="grid h-9 w-9 place-items-center rounded-full border-2 border-black bg-white text-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:rotate-180 active:scale-90"
            >
              <LuArrowUpDown size={15} />
            </button>
          </div>

          {/* TO field */}
          <div className="rounded-2xl border-2 border-black bg-gray-50/90 p-3.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border-2 border-black bg-red-100/80 text-brand">
                <LuMapPin size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">TO</p>
                <PlaceInput
                  label=""
                  text={toText}
                  onText={(val) => {
                    setToText(val);
                    if (!val.trim()) {
                      setTo(null);
                      b.set({ to: null });
                    }
                  }}
                  place={to}
                  onPlace={(p) => {
                    setTo(p);
                    if (p) b.set({ to: asRef(p) });
                  }}
                  placeholder="Select destination city"
                  className="!border-0 !bg-transparent !p-0 !shadow-none focus-within:!ring-0"
                />
              </div>
            </div>
          </div>

          {geoMsg && (
            <p role="status" className="mt-2 rounded-xl border-2 border-black bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              {geoMsg}
            </p>
          )}

          {/* Date + Seats Row */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            {/* Travel Date */}
            <button
              type="button"
              onClick={() => {
                const el = dateRef.current;
                if (!el) return;
                try { el.showPicker(); } catch { el.focus(); el.click(); }
              }}
              className="relative flex items-center gap-2.5 rounded-2xl border-2 border-black bg-gray-50/90 p-3 text-left shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:bg-gray-100/70"
            >
              <LuCalendarDays size={18} className="shrink-0 text-brand" />
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">TRAVEL DATE</p>
                <p className="truncate text-sm font-black text-gray-900">
                  {customDate ? pickedLabel : b.date === isoPlus(0) ? 'Today' : 'Tomorrow'}
                </p>
              </div>
              <input
                ref={dateRef}
                type="date"
                tabIndex={-1}
                aria-hidden
                min={isoPlus(0)}
                value={b.date}
                onChange={(e) => e.target.value && b.set({ date: e.target.value })}
                className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
              />
            </button>

            {/* Seats */}
            <div className="flex items-center justify-between rounded-2xl border-2 border-black bg-gray-50/90 p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <div className="flex items-center gap-2 min-w-0">
                <LuUsers size={18} className="shrink-0 text-brand" />
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">SEATS</p>
                  <p className="truncate text-sm font-black text-gray-900">
                    {b.pax.length} {b.pax.length === 1 ? 'Seat' : 'Seats'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  aria-label="Less"
                  className="grid h-7 w-7 place-items-center rounded-full border-2 border-black bg-white text-gray-900 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:scale-90"
                  onClick={() => b.setPaxCount(Math.max(1, b.pax.length - 1), user?.gender ?? 'male')}
                >
                  <LuMinus size={12} />
                </button>
                <button
                  type="button"
                  aria-label="More"
                  className="grid h-7 w-7 place-items-center rounded-full border-2 border-black bg-white text-gray-900 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:scale-90"
                  onClick={() => b.setPaxCount(Math.min(6, b.pax.length + 1), user?.gender ?? 'male')}
                >
                  <LuPlus size={12} />
                </button>
              </div>
            </div>
          </div>

          {/* Search Buses CTA Button */}
          <button
            onClick={() => search()}
            disabled={resolving || fromText.trim().length < 2 || toText.trim().length < 2}
            className="mt-4 flex min-h-[54px] w-full items-center justify-center gap-2.5 rounded-xl border-2 border-black bg-brand py-4 text-base font-black text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-[.98] disabled:opacity-50"
          >
            {resolving ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Searching…
              </>
            ) : (
              <>
                <LuSearch size={19} /> Search Buses
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── BODY CONTENT ── */}
      <div className="space-y-6 px-4 py-5">
        {/* Features Row (Matching Image 2) */}
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { icon: LuRoute, label: 'Fastest Route', color: 'text-amber-500' },
            { icon: LuShieldCheck, label: 'Safe Travel', color: 'text-emerald-500' },
            { icon: LuRadar, label: 'Live Tracking', color: 'text-brand' },
          ].map(({ icon: Icon, label, color }) => (
            <div
              key={label}
              className="flex items-center justify-center gap-1.5 rounded-2xl border-2 border-black bg-white py-3.5 px-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-center"
            >
              <Icon size={16} className={`${color} shrink-0`} />
              <span className="truncate text-[11px] font-black text-gray-900">{label}</span>
            </div>
          ))}
        </div>

        {/* Popular routes = "Your Last Search" */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-extrabold text-gray-900">
              <LuNavigation size={16} className="text-brand" /> Popular Routes
            </h2>
            <button className="text-xs font-bold text-brand">See All</button>
          </div>

          {popular.isLoading && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 !rounded-2xl" i={i} />)}
            </div>
          )}
          <div className="space-y-2.5">
            {popular.data?.slice(0, 5).map((r, i) => (
              <button
                key={i}
                onClick={() => pick(r)}
                style={{ animationDelay: `${i * 40}ms` }}
                className="animate-fadeUp flex w-full items-center justify-between rounded-2xl border-2 border-black bg-white px-4 py-3.5 text-left shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-[.99]"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 border-black bg-brand/10">
                    <LuBus size={18} className="text-brand" />
                  </div>
                  <div>
                    <p className="font-extrabold text-gray-900">{tp(r.from.name)} <span className="text-brand">→</span> {tp(r.to.name)}</p>
                    <p className="mt-0.5 text-xs font-semibold text-gray-500">Intercity Bus · Daily</p>
                  </div>
                </div>
                <div className="grid h-8 w-8 place-items-center rounded-full border-2 border-black bg-brand/10 text-brand">
                  <span className="text-sm font-black">›</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Offers — "Special Promotion" */}
        {offers.data && offers.data.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-extrabold text-gray-900">
                <LuTag size={16} className="text-brand" /> Special Offers
              </h2>
              <button className="text-xs font-bold text-brand">Show All</button>
            </div>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
              {offers.data.map((o, i) => (
                <div
                  key={o.id}
                  style={{ animationDelay: `${i * 80}ms` }}
                  className={`animate-fadeUp min-w-[220px] rounded-2xl border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${i % 2 === 0 ? 'bg-brand text-white' : 'bg-white text-gray-900'}`}
                >
                  <p className="text-base font-extrabold leading-snug">{t(o.title)}</p>
                  <p className={`mt-1 text-xs font-semibold ${i % 2 === 0 ? 'text-white/85' : 'text-gray-500'}`}>{t(o.note)}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Bottom spacer for tab bar */}
        <div className="h-6" />
      </div>
    </div>
  );

  /* ══════════════════════════════════════════
     DESKTOP  (≥ lg) — unchanged two-column
  ══════════════════════════════════════════ */
  const Desktop = (
    <div className="hidden lg:block pt-6">
      <div className="space-y-6 pb-4">
        <div className="grid grid-cols-[minmax(0,500px)_1fr] gap-10">
          <div className="space-y-5">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-ink/15 bg-surface-tint px-3 py-1 text-xs font-bold text-ink-soft">
                <span className="h-2 w-2 rounded-full bg-brand" />
                <span>Intercity Bus Booking &amp; Real-Time Tracking</span>
              </div>
              <h1 className="mt-2 text-4xl font-black leading-[1.1] tracking-tight text-ink lg:text-5xl">
                Travel across South India <span className="text-brand">with guaranteed seats.</span>
              </h1>
              <p className="mt-2.5 max-w-lg text-base font-medium leading-relaxed text-ink-soft">
                Live GPS tracking, verified operators, and instant refunds across Tamil Nadu, Karnataka, and Kerala.
              </p>
            </div>

            <section className="space-y-3.5 rounded-3xl border-2 border-black bg-card p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" aria-label={t('Search buses')}>
              <div className="relative space-y-2.5">
                <PlaceInput
                  label={t('from')}
                  icon={<LuCircleDot size={18} className="text-ink" />}
                  text={fromText}
                  onText={(val) => {
                    setFromText(val);
                    if (!val.trim()) {
                      setFrom(null);
                      b.set({ from: null });
                    }
                  }}
                  place={from}
                  onPlace={(p) => {
                    setFrom(p);
                    if (p) b.set({ from: asRef(p) });
                  }}
                  placeholder={t('Type source city or town')}
                  trailing={
                    <button
                      type="button"
                      onClick={locate}
                      disabled={geoBusy}
                      aria-label={t('useMyLocation')}
                      className="grid min-h-[44px] min-w-[44px] place-items-center rounded-xl border-2 border-black bg-brand text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition active:scale-95 disabled:opacity-60"
                    >
                      {geoBusy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface/40 border-t-cream" /> : <LuLocateFixed size={18} />}
                    </button>
                  }
                />
                <button
                  type="button"
                  aria-label={t('Swap')}
                  onClick={handleSwap}
                  className="absolute left-1/2 top-1/2 z-20 grid min-h-[44px] min-w-[44px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-black bg-card text-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:rotate-180 active:scale-90"
                >
                  <LuArrowUpDown size={18} />
                </button>
                <PlaceInput
                  label={t('to')}
                  icon={<LuMapPin size={18} className="text-brand" />}
                  text={toText}
                  onText={(val) => {
                    setToText(val);
                    if (!val.trim()) {
                      setTo(null);
                      b.set({ to: null });
                    }
                  }}
                  place={to}
                  onPlace={(p) => {
                    setTo(p);
                    if (p) b.set({ to: asRef(p) });
                  }}
                  placeholder={t('Type destination city or town')}
                />
              </div>
              {geoMsg && <p role="status" className="rounded-xl border-2 border-black bg-surface-tint px-3.5 py-2.5 text-xs font-semibold text-ink-soft shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">{geoMsg}</p>}

              <div className="flex flex-wrap items-center gap-2">
                {[{ label: t('today'), v: isoPlus(0) }, { label: t('tomorrow'), v: isoPlus(1) }].map((c) => (
                  <button key={c.v} onClick={() => b.set({ date: c.v })} className={`min-h-[44px] rounded-xl border-2 border-black px-4 py-2 text-sm font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition active:scale-95 ${b.date === c.v ? 'bg-brand text-white' : 'bg-surface-tint text-ink hover:bg-ink/5'}`}>{c.label}</button>
                ))}
                <button type="button" onClick={() => { const el = dateRef.current; if (!el) return; try { el.showPicker(); } catch { el.focus(); el.click(); } }} className={`relative flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-black px-4 py-2 text-sm font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition active:scale-95 ${customDate ? 'bg-brand text-white' : 'bg-surface-tint text-ink hover:bg-ink/5'}`}>
                  <LuCalendarDays size={18} /><span>{customDate ? pickedLabel : 'Choose Date'}</span>
                  <input ref={dateRef} type="date" tabIndex={-1} aria-hidden min={isoPlus(0)} value={b.date} onChange={(e) => e.target.value && b.set({ date: e.target.value })} className="pointer-events-none absolute inset-0 h-full w-full opacity-0" />
                </button>
              </div>

              <div className="flex items-center justify-between rounded-xl border-2 border-black bg-surface-tint px-4 py-2.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <span className="flex items-center gap-2 text-sm font-bold text-ink"><LuUsers size={18} className="text-brand" />{t('passengers')}</span>
                <div className="flex items-center gap-2.5">
                  <button className="grid min-h-[44px] min-w-[44px] place-items-center rounded-xl border-2 border-black bg-card text-ink shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition active:scale-90" onClick={() => b.setPaxCount(Math.max(1, b.pax.length - 1), user?.gender ?? 'male')}><LuMinus size={16} /></button>
                  <span className="w-6 text-center text-base font-extrabold text-ink">{b.pax.length}</span>
                  <button className="grid min-h-[44px] min-w-[44px] place-items-center rounded-xl border-2 border-black bg-card text-ink shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition active:scale-90" onClick={() => b.setPaxCount(Math.min(6, b.pax.length + 1), user?.gender ?? 'male')}><LuPlus size={16} /></button>
                </div>
              </div>

              <button onClick={() => search()} disabled={resolving || fromText.trim().length < 2 || toText.trim().length < 2}
                className="flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-xl border-2 border-black bg-brand py-3.5 text-base font-extrabold text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-[.98] disabled:opacity-50">
                {resolving ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-surface/40 border-t-cream" /> {t('Finding places…')}</> : <><LuSearch size={19} /> Let's Search</>}
              </button>
            </section>

            <div className="grid grid-cols-3 gap-3">
              {[[LuRoute, 'Fastest Route'], [LuShieldCheck, 'Safe Travel'], [LuRadar, 'Live Tracking']].map(([Icon, label]: any) => (
                <div key={label} className="flex flex-col items-center gap-2 rounded-2xl border-2 border-black bg-card py-3.5 text-center text-[11px] font-extrabold text-ink-soft shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"><Icon size={22} className="text-brand" />{t(label)}</div>
              ))}
            </div>
          </div>

          <div>
            <div className="sticky top-28 overflow-hidden rounded-[2rem] border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              {desktop && <MapLazy interactive={false} markers={markers} className="h-[34rem] !rounded-none" padding={[60, 60]} />}
            </div>
          </div>
        </div>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold"><LuNavigation size={17} className="text-brand" />{t('popularRoutes')}</h2>
          <div className="flex flex-wrap gap-2">
            {popular.isLoading && [0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-36 !rounded-full" i={i} />)}
            {popular.data?.map((r, i) => (
              <button key={i} onClick={() => pick(r)} style={{ animationDelay: `${i * 30}ms` }} className="animate-fadeUp rounded-full border-2 border-black bg-card px-4 py-2 text-sm font-extrabold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-95">{tp(r.from.name)}<Arrow />{tp(r.to.name)}</button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold"><LuTag size={17} className="text-brand" />{t('offers')}</h2>
          <div className="grid grid-cols-3 gap-3">
            {offers.data?.map((o, i) => (
              <div key={o.id} style={{ animationDelay: `${i * 80}ms` }} className={`animate-fadeUp rounded-3xl border-2 border-ink p-5 shadow-card ${i % 2 === 0 ? 'bg-brand text-cream' : 'bg-card text-ink'}`}>
                <p className="text-lg font-extrabold leading-snug">{t(o.title)}</p>
                <p className={`mt-1 text-xs font-semibold ${i % 2 === 0 ? 'text-cream/85' : 'text-ink-soft'}`}>{t(o.note)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );

  return (
    <>
      {Mobile}
      {Desktop}
      {popup && (popupRoute || (from && to)) && (
        <Suspense fallback={null}>
          <RouteTransition
            open={popup}
            from={popupRoute?.from ?? from}
            to={popupRoute?.to ?? to}
            date={b.date}
            onCancel={() => {
              setPopup(false);
              setPopupRoute(null);
            }}
            onDone={() => {
              const rFrom = popupRoute?.from ?? from!;
              const rTo = popupRoute?.to ?? to!;
              nav(`/search?from=${rFrom.slug}&to=${rTo.slug}&date=${b.date}`);
              setPopup(false);
              setPopupRoute(null);
            }}
          />
        </Suspense>
      )}
    </>
  );
}
