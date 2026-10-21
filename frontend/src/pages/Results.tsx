import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LuArmchair, LuArrowLeft, LuBus, LuCalendarDays,
  LuDroplets, LuMapPin, LuMoon, LuSlidersHorizontal,
  LuSnowflake, LuSun, LuSunrise, LuSunset, LuWifi, LuZap
} from 'react-icons/lu';
import { tripsApi } from '../utils/api';
import { approx, bandLabel, busTypeLabel, dateTime, duration, estTag, inr, isoPlus, loc, shortDate, time, tp } from '../utils/format';
import { useBooking } from '../store/booking';
import MapLazy from '../components/MapLazy';
import { Modal, ResultsSkeleton, Skeleton } from '../components/Overlay';
import { Arrow } from '../components/ui';
import { EmptyState } from '../components/states/EmptyState';
import { ErrorState } from '../components/states/ErrorState';
import { PartialDataBanner } from '../components/states/PartialDataState';

const BUS_TYPES = ['seater', 'sleeper', 'double-decker', 'hybrid'];
const BANDS = [['morning', LuSunrise], ['afternoon', LuSun], ['evening', LuSunset], ['night', LuMoon]] as const;

const stepDate = (baseIso: string, daysOffset: number) => {
  const dt = new Date(`${baseIso}T00:00:00+05:30`);
  dt.setDate(dt.getDate() + daysOffset);
  return dt.toISOString().slice(0, 10);
};

export default function Results() {
  const { t } = useTranslation();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const b = useBooking();
  const [types, setTypes] = useState<string[]>([]);
  const [bands, setBands] = useState<string[]>([]);
  const [ac, setAc] = useState('');
  const [sort, setSort] = useState('departure');
  const [sheet, setSheet] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const from = sp.get('from') ?? b.from?.slug ?? '';
  const to = sp.get('to') ?? b.to?.slug ?? '';
  const date = sp.get('date') ?? b.date ?? isoPlus(0);

  const qs = new URLSearchParams({ from, to, date, sort });
  if (types.length) qs.set('busType', types.join(','));
  if (bands.length) qs.set('band', bands.join(','));
  if (ac) qs.set('ac', ac);

  const q = useQuery({
    queryKey: ['search', qs.toString()],
    queryFn: () => tripsApi.search(qs),
    enabled: !!from && !!to,
    staleTime: 60_000,
    placeholderData: (prev) => prev
  });

  const toggle = (arr: string[], v: string, set: (x: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const chip = (on: boolean) =>
    `flex items-center gap-1.5 rounded-full border-2 px-3.5 py-2 text-xs font-extrabold capitalize transition active:scale-95 ${
      on ? 'border-black bg-brand text-white shadow-sm dark:border-white' : 'border-black/30 bg-white text-gray-800 hover:border-black dark:border-white/40 dark:bg-zinc-900 dark:text-zinc-200'
    }`;

  // Dynamically compute the 7-day strip centered on the user's selected travel date
  const days = useMemo(() => {
    const todayStr = isoPlus(0);
    const selectedTime = new Date(`${date}T00:00:00+05:30`).getTime();
    const todayTime = new Date(`${todayStr}T00:00:00+05:30`).getTime();
    const diffDays = Math.round((selectedTime - todayTime) / 864e5);

    // Keep the selected date at index 2 if possible, clamped so start is never before today
    const startOffset = Math.max(0, diffDays - 2);
    return [0, 1, 2, 3, 4, 5, 6].map((i) => isoPlus(startOffset + i));
  }, [date]);

  const d = q.data;
  const dateRef = useRef<HTMLInputElement>(null);
  const filtersN = types.length + bands.length + (ac ? 1 : 0);

  const dayParts = (x: string) => [
    new Date(`${x}T00:00:00+05:30`).toLocaleDateString(loc(), { weekday: 'short', timeZone: 'Asia/Kolkata' }),
    new Date(`${x}T00:00:00+05:30`).toLocaleDateString(loc(), { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
  ];

  return (
    <div className="space-y-4 pb-12">
      {/* ── TOP HEADER (Clean Mobile Header matching reference Image 3 Screen 2) ── */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          onClick={() => nav('/home')}
          aria-label="Back"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border-2 border-black bg-white shadow-sm transition hover:bg-gray-50 active:scale-95 dark:border-white dark:bg-zinc-900"
        >
          <LuArrowLeft size={19} className="text-gray-900 dark:text-white" />
        </button>

        <div className="min-w-0 flex-1 text-center">
          <h1 className="flex items-center justify-center gap-1.5 truncate text-lg font-black text-gray-900 dark:text-white">
            <span>{d ? tp(d.from.name) : from}</span>
            <span className="text-brand">To</span>
            <span>{d ? tp(d.to.name) : to}</span>
          </h1>
          <p className="mt-0.5 text-xs font-semibold text-gray-400 dark:text-zinc-400">
            {shortDate(`${date}T00:00:00+05:30`)} · {b.pax.length} {t('passengers').toLowerCase()}
          </p>
        </div>

        <button
          onClick={() => setSheet(true)}
          aria-label={t('filters')}
          className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl border-2 border-black bg-white shadow-sm transition active:scale-95 dark:border-white dark:bg-zinc-900"
        >
          <LuSlidersHorizontal size={18} className="text-gray-900 dark:text-white" />
          {filtersN > 0 && (
            <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full border border-black bg-brand text-[10px] font-black text-white">
              {filtersN}
            </span>
          )}
        </button>
      </div>

      {/* ── TRAVEL DATE STRIP ── */}
      <div className="flex items-center gap-2">
        <div className="no-scrollbar -mx-4 min-w-0 flex-1 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <div className="flex w-max gap-1.5 rounded-2xl border-2 border-black bg-white p-1.5 shadow-sm dark:border-white dark:bg-zinc-900 lg:w-full" role="tablist" aria-label={t('Travel date')}>
            {days.map((x) => (
              <button
                key={x}
                role="tab"
                aria-selected={x === date}
                onClick={() => { setSp({ from, to, date: x }); b.set({ date: x }); }}
                className={`shrink-0 whitespace-nowrap rounded-xl px-4 py-2 text-center text-xs font-bold transition active:scale-95 lg:min-w-0 lg:flex-1 ${
                  x === date ? 'border-2 border-black bg-brand text-white shadow-sm' : 'border-2 border-transparent text-gray-700 hover:text-gray-900 hover:border-black/30 dark:text-zinc-400 dark:hover:text-white'
                }`}
              >
                <span className="block text-[10px] font-medium leading-tight opacity-80">{dayParts(x)[0]}</span>
                <span className="block font-black leading-tight text-sm">{dayParts(x)[1]}</span>
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          aria-label={t('Choose another date')}
          onClick={() => { const el = dateRef.current; if (!el) return; try { el.showPicker(); } catch { el.focus(); el.click(); } }}
          className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl border-2 border-black transition active:scale-95 ${
            days.includes(date)
              ? 'bg-white text-gray-900 shadow-sm dark:border-white dark:bg-zinc-900 dark:text-white'
              : 'bg-brand text-white'
          }`}
        >
          <LuCalendarDays size={20} />
          <input
            ref={dateRef}
            type="date"
            tabIndex={-1}
            aria-hidden
            min={isoPlus(0)}
            value={date}
            onChange={(e) => { const v = e.target.value; if (v) { setSp({ from, to, date: v }); b.set({ date: v }); } }}
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          />
        </button>
      </div>

      {/* Main Grid: Desktop sidebar + Bus list */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[400px_1fr] lg:items-start lg:gap-8">
        {/* Desktop Sticky Map: Full screen height */}
        <aside className="hidden lg:sticky lg:top-24 lg:block lg:h-[calc(100vh-7.5rem)]">
          <section className="relative flex h-full flex-col overflow-hidden rounded-3xl border-2 border-black bg-white shadow-card dark:border-white dark:bg-zinc-900">
            {d ? (
              <MapLazy
                className="h-full min-h-[460px] flex-1 !rounded-none"
                interactive={true}
                connect
                polyline={d.route?.polyline}
                markers={[
                  { id: 'a', lat: d.from.lat, lng: d.from.lng, kind: 'boarding', title: tp(d.from.name) },
                  { id: 'b', lat: d.to.lat, lng: d.to.lng, kind: 'dropping', title: tp(d.to.name) }
                ]}
                padding={[48, 48]}
              />
            ) : (
              <Skeleton className="h-full min-h-[460px] flex-1 !rounded-none" />
            )}
            <div className="flex items-center justify-between border-t-2 border-black bg-gray-50 px-4 py-3 shrink-0 dark:border-white dark:bg-zinc-900">
              {d ? (
                d.route ? (
                  <p className="text-sm font-extrabold text-gray-800 dark:text-white">
                    {approx(d.route.source)}{d.route.distanceKm} {t('km')}{' '}
                    <span className="mx-1 text-gray-400">·</span>{' '}
                    {approx(d.route.source)}{duration(d.route.durationMin)}
                  </p>
                ) : (
                  <p className="text-sm font-extrabold text-brand">{t('estimateUnavailable')}</p>
                )
              ) : <span />}
              {d?.route && <span className="text-[11px] font-bold text-gray-400">{estTag(d.route.source)}</span>}
            </div>
          </section>
        </aside>

        {/* Bus List Section */}
        <section className="min-w-0 space-y-3.5">
          {d && !d.route && (
            <PartialDataBanner
              message={t('estimateUnavailable') || 'Road route telemetry is temporarily unavailable. Timetables and fares are accurate.'}
              onRetry={() => { q.refetch(); }}
            />
          )}

          {q.isLoading && <ResultsSkeleton />}
          {q.isError && (
            <ErrorState
              title={t('Could not load buses.') || 'Unable to load bus schedule'}
              message="A temporary network issue prevented retrieving live seat and fare inventory. Please retry."
              error={q.error}
              onRetry={() => { q.refetch(); }}
              onSecondaryAction={() => nav('/home')}
              secondaryActionLabel={t('Back to search')}
            />
          )}

          {d && d.trips.length === 0 && (
            <EmptyState
              variant={filtersN > 0 ? 'no-results' : 'first-use'}
              title={filtersN ? t('No buses match these filters') : t('No buses found for {{from}} to {{to}} on this date', { from: tp(d.from.name), to: tp(d.to.name) })}
              description={filtersN ? t('Clear the filters to see every departure.') : t('Try another date from the day strip above.')}
              primaryAction={
                filtersN > 0
                  ? {
                      label: t('Clear filters'),
                      onClick: () => { setTypes([]); setBands([]); setAc(''); },
                    }
                  : {
                      label: t('Try next day'),
                      onClick: () => { const nx = stepDate(date, 1); setSp({ from, to, date: nx }); b.set({ date: nx }); },
                    }
              }
              secondaryAction={
                filtersN > 0
                  ? {
                      label: 'Change Travel Date',
                      onClick: () => { const nx = stepDate(date, 1); setSp({ from, to, date: nx }); b.set({ date: nx }); },
                    }
                  : {
                      label: 'Modify Search Route',
                      onClick: () => nav('/home'),
                    }
              }
            />
          )}

          {/* ── BUS CARD LIST (Exact style with crisp black borders) ── */}
          <div className="space-y-4">
            {d?.trips.map((tr: any, i: number) => (
              <article
                key={tr.id}
                style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
                className="animate-fadeUp rounded-3xl border-2 border-black bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.06)] transition hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:border-white dark:bg-zinc-900"
              >
                {/* Top Row: Operator + Bus Model & Price */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-black text-gray-900 dark:text-white">
                      {tr.operator?.name ?? 'RouteMaster'}
                    </h2>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs font-semibold capitalize text-gray-500 dark:text-zinc-400">
                      <span>{busTypeLabel(tr.bus.busType)}</span>
                      {tr.bus.ac && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <LuSnowflake size={11} /> AC
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xl font-black text-brand">{inr(tr.minFare)}</p>
                    <p className="text-[10px] font-bold text-gray-500 dark:text-zinc-500">per person</p>
                  </div>
                </div>

                {/* Middle Row: Timeline with Duration Badge */}
                <div className="my-4 rounded-2xl border-2 border-black bg-gray-50/90 p-3.5 dark:border-white dark:bg-zinc-800/60">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-base font-black text-gray-900 dark:text-white">
                        {time(tr.departureTime)}
                      </p>
                      <p className="mt-0.5 text-xs font-bold text-gray-600 dark:text-zinc-400">
                        {tp(d.from.name)}
                      </p>
                    </div>

                    {/* Timeline connector */}
                    <div className="flex flex-col items-center px-2">
                      <span className="text-[11px] font-extrabold text-gray-500 dark:text-zinc-400">
                        {duration(tr.durationMin) ?? 'Direct'}
                      </span>
                      <div className="mt-1 flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-brand" />
                        <span className="h-0.5 w-12 border-t-2 border-dashed border-gray-400 dark:border-zinc-500" />
                        <span className="grid h-6 w-6 place-items-center rounded-full border border-black/20 bg-brand/10 text-brand">
                          <LuBus size={12} />
                        </span>
                        <span className="h-0.5 w-12 border-t-2 border-dashed border-gray-400 dark:border-zinc-500" />
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      </div>
                      {tr.distanceKm && (
                        <span className="mt-1 text-[10px] font-semibold text-gray-500">
                          {tr.distanceKm} km
                        </span>
                      )}
                    </div>

                    <div className="text-right">
                      <p className="text-base font-black text-gray-900 dark:text-white">
                        {tr.arrivalTime ? time(tr.arrivalTime) : '--'}
                      </p>
                      <p className="mt-0.5 text-xs font-bold text-gray-600 dark:text-zinc-400">
                        {tp(d.to.name)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Bottom Row: Amenities Chips + Seats Left Badge + Action */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  {/* Amenities */}
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-lg border border-black/30 bg-gray-100 text-gray-700 dark:border-white/30 dark:bg-zinc-800 dark:text-zinc-300" title="Bus">
                      <LuBus size={13} />
                    </span>
                    <span className="grid h-7 w-7 place-items-center rounded-lg border border-black/30 bg-gray-100 text-gray-700 dark:border-white/30 dark:bg-zinc-800 dark:text-zinc-300" title="WiFi">
                      <LuWifi size={13} />
                    </span>
                    <span className="grid h-7 w-7 place-items-center rounded-lg border border-black/30 bg-gray-100 text-gray-700 dark:border-white/30 dark:bg-zinc-800 dark:text-zinc-300" title="Water Bottle">
                      <LuDroplets size={13} />
                    </span>
                    <span className="grid h-7 w-7 place-items-center rounded-lg border border-black/30 bg-gray-100 text-gray-700 dark:border-white/30 dark:bg-zinc-800 dark:text-zinc-300" title="Charging Port">
                      <LuZap size={13} />
                    </span>
                    <span className="rounded-md border border-black/30 bg-gray-100 px-2 py-1 text-[10px] font-extrabold text-gray-700 dark:border-white/30 dark:bg-zinc-800 dark:text-zinc-400">
                      + More
                    </span>
                  </div>

                  {/* Seats left indicator */}
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border-2 border-black px-3 py-1 text-xs font-extrabold dark:border-white ${
                      tr.seatsLeft < 10
                        ? 'bg-red-50 text-brand dark:bg-red-950/40 dark:text-red-400'
                        : 'bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-zinc-200'
                    }`}
                  >
                    <LuArmchair size={13} />
                    {tr.seatsLeft < 10 ? `${tr.seatsLeft} left!` : `${tr.seatsLeft} seats`}
                  </span>
                </div>

                {/* Select Seats Button */}
                <button
                  disabled={tr.seatsLeft === 0}
                  onClick={() => {
                    b.set({ tripId: tr.id, holdId: null, holdExpiresAt: null });
                    nav(`/trip/${tr.id}/seats`);
                  }}
                  className="mt-4 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-black bg-brand py-3 text-sm font-extrabold text-white shadow-cta transition hover:bg-brand-500 active:scale-[.99] disabled:opacity-50 dark:border-white"
                >
                  <LuArmchair size={16} />
                  {t('selectSeats')}
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>

      {/* Filter Modal Sheet */}
      <Modal open={sheet} onClose={() => setSheet(false)} title={t('filters')}>
        <div className="space-y-5">
          <FilterBody
            sort={sort}
            setSort={setSort}
            types={types}
            bands={bands}
            ac={ac}
            setAc={setAc}
            toggle={toggle}
            setTypes={setTypes}
            setBands={setBands}
            chip={chip}
            t={t}
          />
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              onClick={() => { setTypes([]); setBands([]); setAc(''); setSort('departure'); }}
              className="rounded-2xl border-2 border-black bg-white py-3.5 font-bold text-gray-800 transition hover:bg-gray-50 dark:border-white dark:bg-zinc-900 dark:text-zinc-200"
            >
              {t('Reset')}
            </button>
            <button
              onClick={() => setSheet(false)}
              className="rounded-2xl border-2 border-black bg-brand py-3.5 font-extrabold text-white shadow-cta transition hover:bg-brand-500 dark:border-white"
            >
              {t('Show')} {d?.trips.length ?? ''} {t('buses')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function FilterBody({ sort, setSort, types, bands, ac, setAc, toggle, setTypes, setBands, chip, t }: any) {
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-wider text-gray-400">{t('sortBy')}</p>
        <div className="flex flex-wrap gap-2">
          {[
            ['departure', t('departure')],
            ['price', t('price')],
            ['duration', t('duration')],
            ['seats', t('Seats')]
          ].map(([v, l]) => (
            <button key={v} onClick={() => setSort(v)} className={chip(sort === v)}>{l}</button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-wider text-gray-400">{t('Bus type')}</p>
        <div className="flex flex-wrap gap-2">
          {BUS_TYPES.map((x) => (
            <button key={x} onClick={() => toggle(types, x, setTypes)} className={chip(types.includes(x))}>
              {busTypeLabel(x)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-wider text-gray-400">{t('Departure')}</p>
        <div className="flex flex-wrap gap-2">
          {BANDS.map(([x, Icon]) => (
            <button key={x} onClick={() => toggle(bands, x, setBands)} className={chip(bands.includes(x))}>
              <Icon size={14} />{bandLabel(x)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-wider text-gray-400">{t('Comfort')}</p>
        <div className="flex gap-2">
          {[
            ['', t('All')],
            ['true', 'AC'],
            ['false', t('Non-AC')]
          ].map(([v, l]) => (
            <button key={v} onClick={() => setAc(v)} className={chip(ac === v)}>{l}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
