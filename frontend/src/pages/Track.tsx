import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { LuChevronRight, LuClock, LuNavigation, LuRadar } from 'react-icons/lu';
import { bookingsApi, tripsApi } from '../utils/api';
import { dateTime, duration, tp } from '../utils/format';
import MapLazy from '../components/MapLazy';
import { ListSkeleton, Skeleton } from '../components/Overlay';
import { Arrow, PageHeader } from '../components/ui';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';

import { EmptyState } from '../components/states/EmptyState';
import { ErrorState } from '../components/states/ErrorState';
import { PartialDataBanner } from '../components/states/PartialDataState';

export function TrackIndex() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['bookings', 'upcoming'], queryFn: () => bookingsApi.list('upcoming') });
  return (
    <div className="space-y-4">
      <PageHeader to="/home" title={t('Track my bus')} subtitle={t('Live position of your upcoming trips')} />
      {q.isLoading && <ListSkeleton rows={2} />}
      {q.isError && (
        <ErrorState
          title="Couldn't load tracking trips"
          message="We were unable to connect to the bus tracking server. Please check your network and retry."
          error={q.error}
          onRetry={() => { q.refetch(); }}
        />
      )}
      {!q.isLoading && !q.data?.length && (
        <EmptyState
          variant="first-use"
          title="No upcoming trips to track"
          description="Live bus telemetry and GPS positions become active as soon as you have a confirmed upcoming ticket."
          primaryAction={{
            label: 'Search Available Buses',
            onClick: () => { window.location.href = '/home'; },
          }}
        />
      )}
      {q.data?.map((b) => (
        <Link key={b.id} to={`/track/${b.id}`} className="flex items-center gap-3 rounded-3xl border border-ink/10 bg-card p-4 shadow-card transition active:scale-[.99]">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-100 text-brand-700"><LuRadar size={20} /></span>
          <span className="min-w-0 flex-1"><span className="block truncate font-extrabold">{tp(b.from)}<Arrow />{tp(b.to)}</span><span className="block text-xs text-ink-soft">{dateTime(b.trip.departureTime)} {t('· PNR')} {b.pnr}</span></span>
          <LuChevronRight className="text-ink-soft" />
        </Link>
      ))}
    </div>
  );
}

export default function Track() {
  const { t } = useTranslation();
  const { bookingId = '' } = useParams();
  const bk = useQuery({ queryKey: ['booking', bookingId], queryFn: () => bookingsApi.get(bookingId) });
  const tr = useQuery({ queryKey: ['tracking', bk.data?.trip.id], queryFn: () => tripsApi.tracking(bk.data.trip.id), enabled: !!bk.data, refetchInterval: 15_000 });
  const d = tr.data;
  const markers = useMemo(() => (d?.available ? [{ id: 'bus', lat: d.position.lat, lng: d.position.lng, kind: 'bus' as const, title: i18n.t('Your bus') }] : []), [d]);
  return (
    <div className="space-y-4">
      <PageHeader to="/trips" title={bk.data ? <>{tp(bk.data.from)}<Arrow />{tp(bk.data.to)}</> : t('Track')} subtitle={t('Live tracking')} />
      {(bk.isLoading || tr.isLoading) && <><Skeleton className="h-[26rem] !rounded-3xl" /><Skeleton className="h-24 !rounded-3xl" i={1} /></>}
      {(bk.isError || tr.isError) && (
        <ErrorState
          title="Could not connect to live bus tracker"
          message="Live telemetry updates could not be fetched. The bus is running according to schedule."
          error={bk.error || tr.error}
          onRetry={() => { bk.refetch(); tr.refetch(); }}
          onSecondaryAction={() => window.history.back()}
          secondaryActionLabel="Back to Trips"
        />
      )}
      {d && !d.available && (
        <PartialDataBanner
          message={d.message ? t(d.message) : 'Real-time GPS tracker is offline on this vehicle. Schedule estimates are displayed.'}
          onRetry={() => { tr.refetch(); }}
        />
      )}
      {d?.available && (
        <>
          <MapLazy className="h-[26rem]" polyline={d.path} markers={markers} padding={[50, 50]} />
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-2xl border border-ink/10 bg-card p-3"><p className="text-[11px] text-ink-soft">{t('Status')}</p><p className="font-extrabold capitalize">{d.status.replace('_', ' ')}</p></div>
            <div className="rounded-2xl border border-ink/10 bg-card p-3"><p className="text-[11px] text-ink-soft">{t('ETA')}</p><p className="text-xs font-extrabold">{dateTime(d.etaTime)}</p></div>
            <div className="rounded-2xl border border-ink/10 bg-card p-3"><p className="text-[11px] text-ink-soft">{t('Remaining')}</p><p className="font-extrabold">{duration(d.remainingMin)}</p></div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${Math.round(d.progress * 100)}%` }} /></div>
          <p className="flex items-center justify-center gap-2 text-center text-xs text-ink-soft"><LuNavigation size={13} />{d.source === 'gps' ? t('Live GPS from the operator') : t('No GPS tracker on this bus: position is estimated along the real road from the schedule')}<LuClock size={13} />{t('15 s')}</p>
        </>
      )}
    </div>
  );
}
