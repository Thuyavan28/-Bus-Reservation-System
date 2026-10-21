import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import L from 'leaflet';
import { LuActivity, LuArrowRight, LuBus, LuChevronLeft, LuClock, LuFlag, LuHouse, LuMap, LuMapPin, LuMinus, LuNavigation, LuPause, LuPlay, LuPlus, LuTrafficCone, LuX } from 'react-icons/lu';
import { tripsApi, type Place } from '../utils/api';
import { approx, decodePolyline, duration, time, tp } from '../utils/format';
import { makeTiles, pinIcon } from './MapView';
import { useTranslation } from 'react-i18next';

type Phase = 'find' | 'travel' | 'arrived' | 'leave' | 'error';

const TRAVEL_MS = 1000;
const MIN_FIND_MS = 600;
const ARRIVE_AUTO_MS = 2600;
const STEPS = [{ Icon: LuTrafficCone, label: 'Checking Traffic' }, { Icon: LuMap, label: 'Analyzing Route' }, { Icon: LuClock, label: 'Estimating Time' }];

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface Geo { a: Place & { lat: number; lng: number }; b: Place & { lat: number; lng: number }; polyline?: string | null }
interface Info { km?: number; min?: number; source?: string; depTime?: string; arrTime?: string }

/** Distances along a path of {lat,lng}, used to move the vehicle at constant speed. */
function prepare(pts: { lat: number; lng: number }[]) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].lat - pts[i - 1].lat, (pts[i].lng - pts[i - 1].lng) * Math.cos((pts[i].lat * Math.PI) / 180)));
  return { pts, cum, total: cum[cum.length - 1] || 1 };
}
function at(p: ReturnType<typeof prepare>, t: number) {
  const d = t * p.total;
  let i = 1;
  while (i < p.cum.length - 1 && p.cum[i] < d) i++;
  const f = p.cum[i] === p.cum[i - 1] ? 0 : (d - p.cum[i - 1]) / (p.cum[i] - p.cum[i - 1]);
  return { lat: p.pts[i - 1].lat + (p.pts[i].lat - p.pts[i - 1].lat) * f, lng: p.pts[i - 1].lng + (p.pts[i].lng - p.pts[i - 1].lng) * f, i };
}

/**
 * Search journey: route-finding loader -> full-screen satellite map where the vehicle drives the real road
 * (~1 s) -> "You've arrived" card -> bus results. The search is prefetched into the query cache, so the
 * results are instant. Source, destination and date stay in the URL / store throughout.
 */
export default function RouteTransition({ open, from, to, date, onDone, onCancel }: { open: boolean; from: Place | null; to: Place | null; date: string; onDone: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>('find');
  const [geo, setGeo] = useState<Geo | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [retry, setRetry] = useState(0);
  const [pct, setPct] = useState(0);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [auto, setAuto] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const key = from && to ? `from=${from.slug}&to=${to.slug}&date=${date}&sort=departure` : '';
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const trail = useRef<L.Polyline | null>(null);
  const casing = useRef<L.Polyline | null>(null);
  const vehicle = useRef<L.Marker | null>(null);
  const prepared = useRef<ReturnType<typeof prepare> | null>(null);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const tRef = useRef(0);

  useEffect(() => {
    if (!open || phase !== 'find') return;
    const id = setInterval(() => setPct((p) => Math.min(p + 3, 92)), 60);
    return () => clearInterval(id);
  }, [open, phase]);
  useEffect(() => { setStep(Math.min(2, Math.floor(pct / 34))); }, [pct]);

  // 1) fetch the search (and its route) while the loader shows
  useEffect(() => {
    if (!open || !key) return;
    let alive = true;
    setPhase('find'); setGeo(null); setInfo(null); setPct(0); setProgress(0); setPaused(false); setAuto(0); setLeaving(false); tRef.current = 0;
    const wait = new Promise((r) => setTimeout(r, MIN_FIND_MS));
    qc.fetchQuery({ queryKey: ['search', key], queryFn: () => tripsApi.search(key), staleTime: 60_000 })
      .then(async (r) => {
        await wait;
        if (!alive) return;
        const first = r.trips?.[0];
        setInfo({ km: r.route?.distanceKm, min: r.route?.durationMin, source: r.route?.source, depTime: first?.departureTime, arrTime: first?.arrivalTime });
        setGeo({ a: r.from, b: r.to, polyline: r.route?.polyline });
        setPct(100);
        if (reduced()) { doneRef.current(); return; }
      })
      .catch(() => alive && setPhase('error'));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key, retry]);

  // 2) once geometry is known, build the Leaflet map and wait for its tiles, then drive
  useEffect(() => {
    if (!geo || !mapEl.current) return;
    const pts = geo.polyline ? decodePolyline(geo.polyline) : [];
    const route = pts.length > 1 ? pts : [geo.a, geo.b];
    const step = Math.max(1, Math.floor(route.length / 700));
    const sampled = route.filter((_, i) => i % step === 0 || i === route.length - 1);
    prepared.current = prepare(sampled);
    const m = L.map(mapEl.current, { zoomControl: false, attributionControl: true, zoomSnap: 0.25, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, keyboard: false, boxZoom: false });
    m.attributionControl.setPrefix(false);
    const tiles = makeTiles().addTo(m);
    const ll = sampled.map((p) => [p.lat, p.lng] as L.LatLngTuple);
    L.polyline(ll, { color: '#ffffff', weight: 3, opacity: 0.9, className: 'route-base' }).addTo(m);
    casing.current = L.polyline([ll[0]], { color: '#ffffff', weight: 11, opacity: 1 }).addTo(m);
    trail.current = L.polyline([ll[0]], { color: '#FF1840', weight: 6, opacity: 1, className: 'route-glow' }).addTo(m);
    L.marker([geo.a.lat, geo.a.lng], { icon: pinIcon({ id: 'a', lat: 0, lng: 0, kind: 'boarding', title: tp(geo.a.name) }, false, true), interactive: false }).addTo(m);
    L.marker([geo.b.lat, geo.b.lng], { icon: pinIcon({ id: 'b', lat: 0, lng: 0, kind: 'dropping', title: tp(geo.b.name) }, false, true), interactive: false }).addTo(m);
    vehicle.current = L.marker(ll[0], { icon: pinIcon({ id: 'v', lat: 0, lng: 0, kind: 'bus' }, false, false), interactive: false, zIndexOffset: 1000 }).addTo(m);
    m.fitBounds(L.latLngBounds(ll), { paddingTopLeft: [36, 120], paddingBottomRight: [36, 260], animate: false });
    map.current = m;
    let started = false;
    const go = () => { if (started) return; started = true; setPhase('travel'); };
    tiles.once('load', () => setTimeout(go, 120));
    const cap = setTimeout(go, 1400); // never wait forever on slow tiles
    return () => { clearTimeout(cap); m.remove(); map.current = null; };
  }, [geo, open]);

  // 3) travel: ~1 s along the real road
  useEffect(() => {
    if (phase !== 'travel' || !prepared.current) return;
    const p = prepared.current;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      if (!pausedRef.current) tRef.current = Math.min(1, tRef.current + (now - last) / TRAVEL_MS);
      last = now;
      const pos = at(p, ease(tRef.current));
      vehicle.current?.setLatLng([pos.lat, pos.lng]);
      const part = p.pts.slice(0, pos.i).map((q) => [q.lat, q.lng] as L.LatLngTuple);
      part.push([pos.lat, pos.lng]);
      trail.current?.setLatLngs(part);
      casing.current?.setLatLngs(part);
      setProgress(tRef.current);
      if (tRef.current < 1) raf = requestAnimationFrame(frame);
      else setPhase('arrived');
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // 4) arrived: card with a short auto-continue
  useEffect(() => {
    if (phase !== 'arrived') return;
    setAuto(0);
    const id = setInterval(() => setAuto((a) => a + 100 / (ARRIVE_AUTO_MS / 60)), 60);
    return () => clearInterval(id);
  }, [phase]);
  useEffect(() => { if (phase === 'arrived' && auto >= 100) goResults(); }, [auto, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function goResults() {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => doneRef.current(), 260);
  }

  if (!open || !from || !to) return null;
  const mapVisible = phase === 'travel' || phase === 'arrived';
  const zoom = (d: number) => map.current?.setZoom((map.current.getZoom() ?? 7) + d);
  const chip = 'flex items-center rounded-full border-2 border-ink bg-card text-ink shadow-lift';

  return createPortal(
    <div className={`fixed inset-0 z-[95] overflow-hidden bg-brand text-cream transition-opacity duration-300 ${leaving ? 'opacity-0' : ''}`} role="status" aria-live="polite" aria-label={t('Finding buses from {{from}} to {{to}}', { from: tp(from.name), to: tp(to.name) })}>
      {/* Leaflet owns this inner element's classes, so React must never re-render its className */}
      <div className={`absolute inset-0 isolate transition-opacity duration-500 ${mapVisible ? 'opacity-100' : 'opacity-0'}`}><div ref={mapEl} className="absolute inset-0" /></div>

      {phase === 'find' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-brand px-8 text-center">
          <button onClick={onCancel} aria-label={t('Cancel search')} className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full border-2 border-surface text-cream transition active:scale-90 lg:right-8 lg:top-8"><LuX size={20} /></button>
          <div className="relative grid h-60 w-60 place-items-center">
            <span className="absolute inset-0 rounded-full border-2 border-dashed border-surface/60" />
            <span className="absolute inset-0 animate-ping2 rounded-full border-2 border-surface/50" />
            <span className="absolute inset-3 animate-orbit"><span className="absolute left-1/2 top-0 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl border-2 border-ink bg-surface-tint text-ink shadow-lift"><LuBus size={18} /></span></span>
            <span className="absolute inset-9 rounded-full border-4 border-surface/25 border-t-cream animate-orbit [animation-duration:3.2s] [animation-direction:reverse]" />
            <span className="relative grid h-24 w-24 place-items-center rounded-full border-4 border-ink bg-surface-tint text-brand shadow-lift"><LuMapPin size={36} /></span>
          </div>
          <p className="mt-9 text-3xl font-extrabold">{t('Finding the best route…')}</p>
          <p className="mt-2 max-w-sm text-sm font-semibold text-cream/85">{t('Calculating traffic, checking road conditions and planning your journey.')}</p>
          <p className="mt-4 flex items-center gap-2 rounded-full border-2 border-surface/40 px-4 py-1.5 text-sm font-extrabold"><span>{tp(from.name)}</span><LuArrowRight size={15} /><span>{tp(to.name)}</span></p>
          <div className="mt-7 h-3 w-full max-w-sm overflow-hidden rounded-full border-2 border-surface/60"><div className="h-full rounded-full bg-surface-tint transition-all duration-200" style={{ width: `${pct}%` }} /></div>
          <div className="mt-8 grid w-full max-w-sm grid-cols-3 gap-2">
            {STEPS.map(({ Icon, label }, i) => (
              <div key={label} className={`flex flex-col items-center gap-2 text-[11px] font-extrabold transition-opacity ${i <= step ? 'opacity-100' : 'opacity-40'}`}>
                <span className={`grid h-12 w-12 place-items-center rounded-full border-2 ${i === step ? 'animate-bob border-surface bg-surface-tint text-brand' : 'border-surface/60'}`}><Icon size={22} /></span>{t(label)}
              </div>
            ))}
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-brand px-8 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-surface-tint text-brand"><LuActivity size={28} /></span>
          <p className="text-xl font-extrabold">{t('Could not load buses right now.')}</p>
          <div className="flex gap-2"><button onClick={() => setRetry((n) => n + 1)} className="rounded-2xl bg-surface-tint px-6 py-3 font-extrabold text-ink">{t('Try again')}</button><button onClick={onCancel} className="rounded-2xl border-2 border-surface px-6 py-3 font-bold">{t('Back')}</button></div>
        </div>
      )}

      {mapVisible && (
        <>
          <div className="absolute inset-x-0 top-0 mx-auto flex max-w-3xl items-center gap-2 px-4 pt-4">
            <button onClick={onCancel} aria-label={t('Back')} className={`${chip} h-11 w-11 shrink-0 justify-center transition active:scale-90`}><LuChevronLeft size={20} /></button>
            <div className={`${chip} min-w-0 flex-1 justify-center gap-2 px-4 py-2.5 text-sm font-extrabold`}><span className="truncate">{tp(from.name)}</span><LuArrowRight size={14} className="shrink-0 text-brand" /><span className="truncate">{tp(to.name)}</span></div>
            {info?.min != null && <div className={`${chip} shrink-0 gap-1.5 px-3 py-2.5 text-xs font-extrabold`}><LuClock size={14} className="text-brand" />{approx(info.source)}{duration(info.min)}</div>}
            <button onClick={onCancel} aria-label={t('Close')} className={`${chip} h-11 w-11 shrink-0 justify-center transition active:scale-90`}><LuX size={18} /></button>
          </div>
          <div className="absolute right-4 top-24 flex flex-col gap-2 lg:right-8">
            <button onClick={() => zoom(1)} aria-label={t('Zoom in')} className={`${chip} h-11 w-11 justify-center rounded-2xl transition active:scale-90`}><LuPlus size={18} /></button>
            <button onClick={() => zoom(-1)} aria-label={t('Zoom out')} className={`${chip} h-11 w-11 justify-center rounded-2xl transition active:scale-90`}><LuMinus size={18} /></button>
            <button onClick={() => prepared.current && map.current?.fitBounds(L.latLngBounds(prepared.current.pts.map((p) => [p.lat, p.lng] as L.LatLngTuple)), { paddingTopLeft: [36, 120], paddingBottomRight: [36, 260] })} aria-label={t('Fit route')} className={`${chip} mt-1 h-11 w-11 justify-center rounded-2xl transition active:scale-90`}><LuNavigation size={18} /></button>
          </div>
        </>
      )}

      {phase === 'travel' && (
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-xl space-y-3 p-4">
          <div className="flex items-center gap-3 rounded-3xl border-2 border-ink bg-card p-3.5 text-ink shadow-lift">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand text-cream"><LuBus size={22} /></span>
            <div className="flex-1"><p className="text-xl font-extrabold leading-tight">{info?.min != null ? `${approx(info.source)}${duration(info.min)}` : t('On the way')}</p><p className="text-xs font-semibold text-ink-soft">{info?.km != null ? `${approx(info.source)}${info.km} km · ${t('road route')}` : t('Route distance unavailable')}</p></div>
            <LuArrowRight className="text-ink-soft" />
          </div>
          <div className="flex items-center gap-3 rounded-full border-2 border-ink bg-card px-3 py-2.5 text-ink shadow-lift">
            <button onClick={() => setPaused((p) => !p)} aria-label={paused ? t('Resume') : t('Pause')} className="grid h-9 w-9 place-items-center rounded-full bg-ink text-cream transition active:scale-90">{paused ? <LuPlay size={15} /> : <LuPause size={15} />}</button>
            <div className="relative h-2 flex-1 rounded-full bg-ink/15"><div className="h-full rounded-full bg-brand" style={{ width: `${progress * 100}%` }} /><span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-surface-tint" style={{ left: `${progress * 100}%` }} /></div>
          </div>
        </div>
      )}

      {phase === 'arrived' && (
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-xl p-4">
          <div className="animate-fadeUp space-y-4 rounded-[2rem] border-2 border-ink bg-card p-5 text-ink shadow-lift">
            <div className="flex items-center gap-3">
              <span className="grid h-14 w-14 animate-tick place-items-center rounded-2xl bg-brand text-cream"><LuFlag size={26} /></span>
              <div><p className="text-2xl font-extrabold leading-tight">{t('You\'ve Arrived!')}</p><p className="text-sm font-semibold text-ink-soft">{t('Welcome to {{city}}', { city: tp(to.name) })}</p></div>
            </div>
            <div className="grid grid-cols-2 divide-x-2 divide-ink/10 rounded-2xl border-2 border-ink/10 bg-surface-tint py-3 text-sm">
              <div className="flex items-center gap-3 px-4"><LuClock size={22} className="text-brand" /><div><p className="text-[11px] font-bold text-ink-soft">{t('Total Travel Time')}</p><p className="font-extrabold">{info?.min != null ? `${approx(info.source)}${duration(info.min)}` : '--'}</p></div></div>
              <div className="flex items-center gap-3 px-4"><LuMapPin size={22} className="text-brand" /><div><p className="text-[11px] font-bold text-ink-soft">{t('Distance')}</p><p className="font-extrabold">{info?.km != null ? `${approx(info.source)}${info.km} km` : '--'}</p></div></div>
            </div>
            {info?.depTime && <p className="text-center text-xs font-semibold text-ink-soft">{t('First bus departs')} {time(info.depTime)}{info.arrTime ? ` · ${t('arrives')} ${time(info.arrTime)}` : ''}</p>}
            <button onClick={goResults} className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-ink py-4 text-base font-extrabold text-cream shadow-cta transition active:scale-[.98]">
              <span className="absolute inset-y-0 left-0 bg-brand" style={{ width: `${Math.min(auto, 100)}%` }} />
              <span className="relative flex items-center gap-2">{t('View buses')} <LuArrowRight size={18} /></span>
            </button>
            <button onClick={onCancel} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-ink py-3.5 text-sm font-extrabold transition active:scale-[.98]"><LuHouse size={16} /> {t('Back to Home')}</button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
