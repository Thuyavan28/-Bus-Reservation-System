import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  LuBus,
  LuCheckCheck,
  LuClock,
  LuCopy,
  LuDownload,
  LuMapPin,
  LuNavigation,
  LuRoute,
  LuSparkles,
  LuTicket,
  LuUser,
  LuArrowRight,
  LuRotateCcw,
} from 'react-icons/lu';
import { bookingsApi } from '../utils/api/bookings';
import { dateTime, dayStr, inr, tp } from '../utils/format';
import { Barcode } from '../pages/Ticket';
import { toast } from '../store/ui';

export default function TicketVerify() {
  const { pnr = '' } = useParams();
  const nav = useNavigate();
  const { t } = useTranslation();
  const [downloading, setDownloading] = useState(false);

  const q = useQuery({
    queryKey: ['ticket-verify', pnr],
    queryFn: () => bookingsApi.verify(pnr),
    retry: 1,
  });

  const d = q.data;

  const handleCopy = () => {
    if (d?.pnr) {
      void navigator.clipboard?.writeText(d.pnr).then(
        () => toast.success(t('PNR copied')),
        () => toast.error(t('Could not copy PNR'))
      );
    }
  };

  const handleDownloadPdf = async () => {
    if (!d) return;
    setDownloading(true);
    try {
      const blob = await bookingsApi.verifyPdf(d.pnr);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ticket-${d.pnr}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('Ticket downloaded'));
    } catch {
      toast.error(t('Could not download the ticket'));
    } finally {
      setDownloading(false);
    }
  };

  // Loading skeleton
  if (q.isLoading) {
    return (
      <div className="min-h-screen bg-gray-50/70 px-4 py-8 dark:bg-zinc-950 sm:py-12">
        <div className="mx-auto w-full max-w-xl animate-pulse space-y-4">
          <div className="h-14 w-full rounded-3xl border-2 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" />
          <div className="h-96 w-full rounded-3xl border-2 border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" />
        </div>
      </div>
    );
  }

  // Not found / error state
  if (q.isError || !d) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50/70 px-4 py-12 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-lg flex-col items-center justify-center rounded-3xl border-2 border-black bg-white p-8 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:p-12">
          <div className="relative mb-5 grid h-16 w-16 place-items-center rounded-2xl border-2 border-black bg-brand/10 text-brand shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            <LuTicket size={32} />
          </div>
          <h2 className="text-xl font-black text-gray-900 sm:text-2xl">
            {t('Ticket Not Found')}
          </h2>
          <p className="mt-2 text-sm font-medium text-gray-600 sm:text-base">
            {t('We could not find any active booking matching code')}{' '}
            <span className="font-black text-brand">{pnr}</span>. {t('Please check your ticket or scan the QR code on your latest ticket.')}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button
              onClick={() => q.refetch()}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-black bg-white px-5 py-2.5 text-sm font-extrabold text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-95"
            >
              <LuRotateCcw size={16} /> {t('Retry')}
            </button>
            <button
              onClick={() => nav('/home')}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-black bg-brand px-6 py-2.5 text-sm font-extrabold text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-95"
            >
              {t('Go to Home')} <LuArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const seats = d.passengers?.map((p: any) => p.seatLabel).join(', ') || '';
  const fromCode = (d.from || '').slice(0, 3).toUpperCase();
  const toCode = (d.to || '').slice(0, 3).toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50/70 px-4 py-6 dark:bg-zinc-950 sm:py-10">
      <div className="mx-auto w-full max-w-xl space-y-5">
        {/* Brand Bar */}
        <div className="flex items-center justify-between rounded-2xl border-2 border-black bg-white px-4 py-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          <Link to="/home" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl border-2 border-black bg-brand text-white shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
              <LuBus size={17} />
            </span>
            <span className="text-sm font-black tracking-tight text-gray-900">
              BusGo <span className="text-brand">South</span>
            </span>
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-emerald-800 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
            <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
            {t('VERIFIED PASS')}
          </span>
        </div>

        {/* ── MAIN BOARDING PASS CARD ── */}
        <article className="overflow-hidden rounded-3xl border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          {/* Header Strip */}
          <div className="border-b-2 border-black bg-brand p-5 text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-block rounded-lg border border-white/30 bg-white/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-200">
                  {t('Digital Boarding Pass')}
                </span>
                <h1 className="mt-1 text-xl font-black text-white sm:text-2xl">
                  {d.operator || t('Express Luxury Fleet')}
                </h1>
                <p className="text-xs font-semibold text-white/85">
                  {dayStr(d.trip?.departureTime)}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">
                  {t('PNR')}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-base font-black tracking-wider text-white">
                    {d.pnr}
                  </span>
                  <button
                    onClick={handleCopy}
                    aria-label={t('Copy PNR')}
                    className="grid h-6 w-6 place-items-center rounded-md bg-white/20 text-white transition hover:bg-white/30 active:scale-90"
                  >
                    <LuCopy size={12} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Route Overview */}
          <div className="border-b-2 border-dashed border-black/20 p-5">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <span className="text-xs font-black uppercase tracking-wider text-brand">
                  {fromCode}
                </span>
                <p className="truncate text-lg font-black text-gray-900">
                  {tp(d.from)}
                </p>
                <p className="text-xs font-bold text-gray-700">
                  {dateTime(d.trip?.departureTime)}
                </p>
              </div>

              {/* Connecting bus icon line */}
              <div className="flex flex-col items-center px-4">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-brand" />
                  <span className="h-0.5 w-8 border-t-2 border-dashed border-gray-400 sm:w-12" />
                  <span className="grid h-7 w-7 place-items-center rounded-full border border-black/20 bg-brand/10 text-brand">
                    <LuBus size={13} />
                  </span>
                  <span className="h-0.5 w-8 border-t-2 border-dashed border-gray-400 sm:w-12" />
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                </div>
                {d.durationMin != null && (
                  <span className="mt-1 text-[10px] font-bold text-gray-600">
                    {Math.floor(d.durationMin / 60)}h {d.durationMin % 60}m
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1 text-right">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-600">
                  {toCode}
                </span>
                <p className="truncate text-lg font-black text-gray-900">
                  {tp(d.to)}
                </p>
                <p className="text-xs font-bold text-gray-700">
                  {dateTime(d.arrivalTime)}
                </p>
              </div>
            </div>

            {/* Boarding point banner */}
            {d.boarding && (
              <div className="mt-4 rounded-2xl border-2 border-black bg-gray-50 p-3 text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <div className="flex items-start gap-2">
                  <LuMapPin size={15} className="mt-0.5 shrink-0 text-brand" />
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-gray-900">
                      {t('Boarding Point')}: {tp(d.boarding.name)}
                    </p>
                    {d.boarding.address && (
                      <p className="mt-0.5 text-gray-600">{d.boarding.address}</p>
                    )}
                    {d.boarding.landmark && (
                      <p className="mt-0.5 text-[11px] font-semibold text-gray-500">
                        {t('Landmark')}: {d.boarding.landmark}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Passengers & Assigned Seats */}
          <div className="p-5">
            <div className="flex items-center justify-between border-b-2 border-black/10 pb-2.5">
              <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-gray-500">
                <LuUser size={14} className="text-brand" /> {t('Passengers')} ({d.passengers?.length || 0})
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-black/20 bg-brand/10 px-2.5 py-0.5 text-xs font-black text-brand">
                <LuSparkles size={11} /> {t('Seat')} {seats}
              </span>
            </div>

            <ul className="mt-3 divide-y divide-gray-100 text-sm">
              {d.passengers?.map((p: any, idx: number) => (
                <li key={p.seatId || idx} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="font-extrabold text-gray-900">
                      {p.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {p.age} {t('yrs')} · {p.gender}
                    </p>
                  </div>
                  <span className="rounded-xl border-2 border-black bg-brand px-3 py-1 text-xs font-black text-white shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                    {t('Seat')} {p.seatLabel}
                  </span>
                </li>
              ))}
            </ul>

            {/* Fare Summary */}
            <div className="mt-4 flex items-center justify-between rounded-2xl border-2 border-black bg-gray-50 p-3.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <div>
                <p className="text-[11px] font-bold uppercase text-gray-500">{t('Payment Status')}</p>
                <p className="flex items-center gap-1 text-xs font-black text-emerald-800">
                  <LuCheckCheck size={14} /> {t('PAID & CONFIRMED')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold uppercase text-gray-500">{t('Total Amount')}</p>
                <p className="text-lg font-black text-brand">{inr(d.price?.total)}</p>
              </div>
            </div>
          </div>

          {/* Barcode Strip */}
          <div className="border-t-2 border-dashed border-black/30 bg-gray-50/50 p-5 text-center">
            <Barcode value={d.pnr} />
            <p className="mt-2 font-mono text-base font-black tracking-[0.25em] text-gray-900">
              {d.pnr}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-gray-500">
              {t('Official verified boarding pass – Present at bus boarding gate')}
            </p>
          </div>
        </article>

        {/* ── ACTION BUTTONS (Neo-Brutalist Style) ── */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-black bg-brand py-3.5 text-base font-extrabold text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-95 disabled:opacity-60"
          >
            <LuDownload size={18} />
            {downloading ? t('Generating PDF…') : t('Download Ticket (PDF)')}
          </button>

          <div className="grid grid-cols-2 gap-3">
            <Link
              to={`/track/${d.id}`}
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-black bg-white py-3 text-sm font-extrabold text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-95"
            >
              <LuNavigation size={16} className="text-brand" />
              {t('Live Tracking')}
            </Link>

            <Link
              to="/home"
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-black bg-white py-3 text-sm font-extrabold text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-95"
            >
              <LuRoute size={16} className="text-gray-700" />
              {t('Book Trip')}
            </Link>
          </div>
        </div>

        {/* Footer Support Info */}
        <div className="rounded-2xl border-2 border-black bg-white p-4 text-center text-xs font-semibold text-gray-600 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          <p>
            {t('Need assistance with your journey?')} {t('Helpline')}:{' '}
            <b className="text-gray-900">1800-419-7890</b>
          </p>
        </div>
      </div>
    </div>
  );
}
