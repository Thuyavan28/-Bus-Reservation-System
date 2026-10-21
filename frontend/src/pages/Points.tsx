import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LuCheck, LuFlag, LuMapPin } from 'react-icons/lu';
import { tripsApi } from '../utils/api';
import { time, tp } from '../utils/format';
import { useBooking } from '../store/booking';
import MapLazy, { type MapMarker } from '../components/MapLazy';
import { Skeleton } from '../components/Overlay';
import { Countdown, PageHeader } from '../components/ui';

/** Boarding / dropping step: real map with both sets of pins, plus the landmark text. */
export default function Points() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const nav = useNavigate();
  const b = useBooking();
  const trip = useQuery({ queryKey: ['trip', id], queryFn: () => tripsApi.detail(id) });

  if (!b.holdId) { nav(`/trip/${id}/seats`, { replace: true }); return null; }
  const tr = trip.data;
  const markers: MapMarker[] = tr ? [
    ...tr.boarding.map((p) => ({ id: `b:${p.pointId}`, lat: p.lat, lng: p.lng, kind: 'boarding' as const, title: tp(p.name) })),
    ...tr.dropping.map((p) => ({ id: `d:${p.pointId}`, lat: p.lat, lng: p.lng, kind: 'dropping' as const, title: tp(p.name) })),
  ] : [];
  const onPin = (mid: string) => (mid.startsWith('b:') ? b.set({ boardingPointId: mid.slice(2) }) : b.set({ droppingPointId: mid.slice(2) }));

  const List = ({ title, Icon, tone, items, value, onPick }: { title: string; Icon: typeof LuMapPin; tone: string; items: any[]; value: string | null; onPick: (id: string) => void }) => (
    <section className="space-y-2">
      <p className="flex items-center gap-2 font-extrabold"><Icon size={16} className={tone} />{title}</p>
      {items.map((p) => (
        <button key={p.pointId} onClick={() => onPick(p.pointId)} className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition active:scale-[.99] ${value === p.pointId ? 'border-brand bg-card shadow-card' : 'border-ink/10 bg-card'}`}>
          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${value === p.pointId ? 'border-brand bg-brand text-cream' : 'border-ink/25'}`}>{value === p.pointId && <LuCheck size={13} strokeWidth={4} />}</span>
          <span className="min-w-0 flex-1"><span className="block truncate font-bold">{tp(p.name)}</span><span className="block truncate text-xs text-ink-soft">{tp(p.landmark)}</span></span>
          {p.time && <span className="text-sm font-extrabold">{time(p.time)}</span>}
        </button>
      ))}
    </section>
  );

  return (
    <div>
      <PageHeader title={t('Boarding & dropping')} subtitle={t('Pick where you get on and off')} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start lg:gap-8">
        <div className="space-y-4 lg:sticky lg:top-24">
          <Countdown to={b.holdExpiresAt} label={t('holdTimer')} onExpire={() => { b.clearSelection(); nav(`/trip/${id}/seats`, { replace: true }); }} />
          {tr ? <MapLazy markers={markers} selectedId={b.boardingPointId ? `b:${b.boardingPointId}` : null} onMarkerClick={onPin} className="h-64 !rounded-[1.8rem] border-2 border-ink lg:h-[30rem]" padding={[48, 48]} /> : <Skeleton className="h-64 !rounded-3xl lg:h-[30rem]" />}
        </div>
        <div className="space-y-4">
      {tr ? (
        <>
          <List title={t('boardingPoint')} Icon={LuMapPin} tone="text-ink" items={tr.boarding} value={b.boardingPointId} onPick={(v) => b.set({ boardingPointId: v })} />
          <List title={t('droppingPoint')} Icon={LuFlag} tone="text-brand" items={tr.dropping} value={b.droppingPointId} onPick={(v) => b.set({ droppingPointId: v })} />
        </>
      ) : <><Skeleton className="h-20" i={1} /><Skeleton className="h-20" i={2} /></>}
      <div className="sticky bottom-3 z-20">
        <button disabled={!b.boardingPointId || !b.droppingPointId} onClick={() => nav(`/trip/${id}/passengers`)} className="w-full rounded-2xl bg-brand py-4 text-base font-extrabold text-cream shadow-cta transition hover:bg-brand-500 active:scale-[.99] disabled:opacity-50">{t('continue')}</button>
      </div>
        </div>
      </div>
    </div>
  );
}
