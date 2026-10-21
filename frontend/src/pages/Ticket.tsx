import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import JsBarcode from 'jsbarcode';
import {
  LuArrowLeft, LuBus, LuClock,
  LuDownload, LuMapPin, LuRadar, LuRoute,
  LuSparkles, LuUsers, LuReceipt
} from 'react-icons/lu';
import { bookingsApi } from '../utils/api';
import { approx, duration, genderLabel, inr, time, tp } from '../utils/format';
import { toast } from '../store/ui';
import { StatusPill } from '../components/ui';
import { TicketSkeleton } from '../components/Overlay';
import { ErrorState } from '../components/states/ErrorState';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';

const dayStr = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

/** Scannable Code 128 barcode of the PNR, drawn as SVG */
function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current) {
      JsBarcode(ref.current, value, {
        format: 'CODE128',
        displayValue: false,
        height: 70,
        width: 2.2,
        margin: 0,
        lineColor: '#18181B',
        background: 'transparent'
      });
    }
  }, [value]);
  return (
    <svg
      ref={ref}
      className="mx-auto h-20 w-4/5 max-w-xs"
      role="img"
      aria-label={`${i18n.t('Barcode')} ${value}`}
      preserveAspectRatio="none"
    />
  );
}

export default function Ticket() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [mode, setMode] = useState<'barcode' | 'qr'>('barcode');
  const b = useQuery({ queryKey: ['booking', id], queryFn: () => bookingsApi.get(id) });
  const qr = useQuery({
    queryKey: ['qr', id],
    queryFn: () => bookingsApi.ticket(id),
    enabled: !!b.data && b.data.status !== 'pending_payment'
  });

  const emailToastSent = useRef(false);

  // Email confirmation sent as toast format instead of static banner
  useEffect(() => {
    if (b.data?.status === 'booked' && b.data?.contact?.email && !emailToastSent.current) {
      emailToastSent.current = true;
      toast.success(
        t('Your order is placed. Ticket emailed to {{email}}.', { email: b.data.contact.email }) ||
        `Your order is placed. Ticket emailed to ${b.data.contact.email}`
      );
    }
  }, [b.data?.status, b.data?.contact?.email, t]);

  async function pdf() {
    try {
      const blob = await bookingsApi.ticketPdf(id);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ticket-${b.data.pnr}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error(t('Could not download the ticket.'));
    }
  }

  if (b.isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 py-6">
        <TicketSkeleton />
      </div>
    );
  }

  if (b.isError) {
    return (
      <div className="mx-auto w-full max-w-5xl py-8">
        <ErrorState
          title="Couldn't load your ticket"
          message="We were unable to retrieve your ticket confirmation details. Please retry."
          error={b.error}
          onRetry={() => { b.refetch(); }}
          onSecondaryAction={() => nav('/trips')}
          secondaryActionLabel="Return to Trips"
        />
      </div>
    );
  }

  const d = b.data;
  if (!d) {
    return (
      <div className="mx-auto w-full max-w-5xl rounded-3xl border-2 border-black bg-white p-8 text-center dark:border-white dark:bg-zinc-900">
        {t('Booking not found.')}
      </div>
    );
  }

  const seats = d.passengers.map((p: any) => p.seatLabel).join(', ');
  const fromCode = (d.from || '').slice(0, 3).toUpperCase();
  const toCode = (d.to || '').slice(0, 3).toUpperCase();

  /* ─────────────────────────────────────────────────────────────
     Boarding Pass Card with crisp black borders
  ───────────────────────────────────────────────────────────── */
  const BoardingPassCard = (
    <article className="relative overflow-hidden rounded-[2rem] border-2 border-black bg-white shadow-card dark:border-white dark:bg-zinc-900">
      {/* Route Header Banner */}
      <div className="border-b-2 border-black bg-gray-50/80 p-5 dark:border-white dark:bg-zinc-800/50">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <span className="text-xs font-black uppercase tracking-wider text-brand">
              {fromCode}
            </span>
            <p className="truncate text-base font-black text-gray-900 dark:text-white">
              {tp(d.from)}
            </p>
            {d.boarding?.name && (
              <p className="truncate text-[11px] font-semibold text-gray-500 dark:text-zinc-400">
                {tp(d.boarding.name)}
              </p>
            )}
          </div>

          {/* Connecting bus icon line */}
          <div className="flex flex-col items-center px-4">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-brand" />
              <span className="h-0.5 w-10 border-t-2 border-dashed border-gray-400 dark:border-zinc-500" />
              <span className="grid h-7 w-7 place-items-center rounded-full border border-black/20 bg-brand/10 text-brand">
                <LuBus size={13} />
              </span>
              <span className="h-0.5 w-10 border-t-2 border-dashed border-gray-400 dark:border-zinc-500" />
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
            <span className="mt-1 text-[10px] font-bold text-gray-500">
              {d.durationMin != null ? `${approx(d.estimateSource)}${duration(d.durationMin)}` : 'Direct'}
            </span>
          </div>

          <div className="min-w-0 flex-1 text-right">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              {toCode}
            </span>
            <p className="truncate text-base font-black text-gray-900 dark:text-white">
              {tp(d.to)}
            </p>
            {d.dropping?.name && (
              <p className="truncate text-[11px] font-semibold text-gray-500 dark:text-zinc-400">
                {tp(d.dropping.name)}
              </p>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between border-t-2 border-black/15 pt-3 dark:border-white/20">
          <span className="text-xs font-extrabold text-gray-500 dark:text-zinc-400">
            Ref. <strong className="font-black text-gray-900 dark:text-white">{d.pnr}</strong>
          </span>
          <span className="rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-[11px] font-black text-brand">
            {d.operator}
          </span>
        </div>
      </div>

      {/* 2x3 Details Grid */}
      <div className="grid grid-cols-3 gap-y-4 gap-x-2 p-5 text-left">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Travelling Date</p>
          <p className="mt-1 text-xs font-black text-gray-900 dark:text-white">{dayStr(d.trip.departureTime)}</p>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Seat No.</p>
          <p className="mt-1 inline-flex items-center gap-1 rounded-lg border border-black/30 bg-brand px-2 py-0.5 text-xs font-black text-white">
            {seats}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Bus / Operator</p>
          <p className="mt-1 truncate text-xs font-black text-gray-900 dark:text-white">{d.operator}</p>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Boarding Time</p>
          <p className="mt-1 text-xs font-black text-gray-900 dark:text-white">{time(d.trip.departureTime)}</p>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Passengers</p>
          <p className="mt-1 text-xs font-black text-gray-900 dark:text-white">
            {d.passengers.length} {d.passengers.length === 1 ? 'Adult' : 'Adults'}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Class</p>
          <p className="mt-1 text-xs font-black text-emerald-600 dark:text-emerald-400">
            {d.trip?.bus?.busType ? `${d.trip.bus.busType.toUpperCase()}` : 'Executive AC'}
          </p>
        </div>
      </div>

      {/* Passenger summary in ticket */}
      <div className="border-t-2 border-black bg-gray-50/50 px-5 py-3 dark:border-white dark:bg-zinc-800/40">
        <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Passengers & Seats</p>
        <div className="mt-1.5 space-y-1.5">
          {d.passengers.map((p: any) => (
            <div key={p.seatId} className="flex items-center justify-between text-xs">
              <span className="font-bold text-gray-800 dark:text-zinc-200">
                {p.name} ({p.age}y, {genderLabel(p.gender)})
              </span>
              <span className="rounded-md border border-black bg-white px-2 py-0.5 text-[11px] font-black text-brand shadow-sm dark:bg-zinc-900 dark:border-white">
                Seat {p.seatLabel}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Luxury Fleet Visual Banner */}
      <div className="relative mx-5 my-2.5 overflow-hidden rounded-2xl border-2 border-black bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 p-4 text-white shadow-inner">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-white shadow-md">
              <LuBus size={18} />
            </span>
            <div>
              <p className="text-xs font-black">Express Luxury Fleet</p>
              <p className="text-[10px] text-zinc-400">Verified Boarding Pass</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-black">
            <LuSparkles size={11} className="text-amber-300" />
            <span>Seat {seats}</span>
          </div>
        </div>
      </div>

      {/* Barcode / QR Section */}
      <div className="border-t-2 border-dashed border-black p-5 text-center dark:border-white">
        <div className="mb-3.5 flex justify-center gap-2">
          <button
            onClick={() => setMode('barcode')}
            className={`rounded-full px-4 py-1.5 text-xs font-black border-2 transition ${
              mode === 'barcode'
                ? 'border-black bg-brand text-white shadow-sm'
                : 'border-black/30 bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-zinc-300 dark:border-white/30'
            }`}
          >
            Barcode
          </button>
          <button
            onClick={() => setMode('qr')}
            className={`rounded-full px-4 py-1.5 text-xs font-black border-2 transition ${
              mode === 'qr'
                ? 'border-black bg-brand text-white shadow-sm'
                : 'border-black/30 bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-zinc-300 dark:border-white/30'
            }`}
          >
            QR Code
          </button>
        </div>

        {mode === 'barcode' ? (
          <div>
            <Barcode value={d.pnr} />
            <p className="mt-2 text-base font-black tracking-[0.25em] text-gray-800 dark:text-white">
              {d.pnr}
            </p>
          </div>
        ) : (
          <div>
            {qr.data ? (
              <img
                src={qr.data.qr}
                alt={t('QR e-ticket')}
                className="mx-auto h-36 w-36 rounded-xl border-2 border-black p-2 shadow-sm bg-white"
              />
            ) : (
              <div className="skeleton mx-auto h-36 w-36 rounded-xl" />
            )}
            <p className="mt-2 text-base font-black tracking-[0.25em] text-gray-800 dark:text-white">
              {d.pnr}
            </p>
          </div>
        )}

        <p className="mt-1.5 text-[11px] font-semibold text-gray-500">
          Show this digital ticket at boarding gate
        </p>

        <div className="mt-4 flex items-center justify-between border-t-2 border-black/15 pt-3 text-xs dark:border-white/20">
          <span className="font-bold text-gray-600 dark:text-zinc-400">Total Paid</span>
          <span className="text-base font-black text-brand">{inr(d.price.total)}</span>
        </div>
      </div>
    </article>
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-20 pt-2">
      {/* ── TOP HEADER ── */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => nav('/trips')}
          aria-label="Back"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border-2 border-black bg-white shadow-sm transition hover:bg-gray-50 active:scale-95 dark:border-white dark:bg-zinc-900"
        >
          <LuArrowLeft size={19} className="text-gray-800 dark:text-white" />
        </button>

        <div className="min-w-0 flex-1 text-center lg:text-left">
          <h1 className="text-xl font-black text-gray-900 dark:text-white">
            E-Ticket & Booking Details
          </h1>
          <p className="text-xs font-semibold text-gray-500 dark:text-zinc-400">
            Booking PNR: <span className="font-black text-brand">{d.pnr}</span> · Travel Date: {dayStr(d.trip.departureTime)}
          </p>
        </div>

        <div className="shrink-0">
          <StatusPill status={d.status} />
        </div>
      </div>

      {/* ── RESPONSIVE 2-COLUMN DESKTOP / 1-COLUMN MOBILE LAYOUT ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        {/* LEFT COLUMN: Journey Details & Passenger Summary */}
        <div className="space-y-5 lg:col-span-7">
          {/* Trip Journey Card with Black Border */}
          <section className="rounded-3xl border-2 border-black bg-white p-5 shadow-sm dark:border-white dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b-2 border-black pb-3 dark:border-white">
              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                <LuRoute size={16} className="text-brand" /> Journey Overview
              </span>
              <span className="text-xs font-extrabold text-brand">
                {d.operator}
              </span>
            </div>

            {/* Stations & Timeline */}
            <div className="mt-4 space-y-4">
              {/* Departure */}
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase text-brand tracking-wider">BOARDING POINT</span>
                  <p className="text-base font-black text-gray-900 dark:text-white">{tp(d.from)}</p>
                  {d.boarding?.name && (
                    <p className="text-xs font-medium text-gray-500 dark:text-zinc-400">{tp(d.boarding.name)}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-base font-black text-gray-900 dark:text-white">{time(d.trip.departureTime)}</p>
                  <p className="text-xs font-medium text-gray-400">{dayStr(d.trip.departureTime)}</p>
                </div>
              </div>

              {/* Transit line badge */}
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 border-t-2 border-dashed border-gray-300 dark:border-zinc-700" />
                <div className="flex items-center gap-1.5 rounded-full border-2 border-black bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700 dark:border-white dark:bg-zinc-800 dark:text-zinc-200">
                  <LuClock size={13} className="text-brand" />
                  <span>{d.durationMin != null ? `${approx(d.estimateSource)}${duration(d.durationMin)}` : 'Direct Route'}</span>
                  {d.distanceKm && (
                    <>
                      <span>·</span>
                      <span>{d.distanceKm} km</span>
                    </>
                  )}
                </div>
                <div className="flex-1 border-t-2 border-dashed border-gray-300 dark:border-zinc-700" />
              </div>

              {/* Arrival */}
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase text-emerald-600 tracking-wider">DROPPING POINT</span>
                  <p className="text-base font-black text-gray-900 dark:text-white">{tp(d.to)}</p>
                  {d.dropping?.name && (
                    <p className="text-xs font-medium text-gray-500 dark:text-zinc-400">{tp(d.dropping.name)}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-base font-black text-gray-900 dark:text-white">
                    {d.trip?.arrivalTime ? time(d.trip.arrivalTime) : 'Est. scheduled'}
                  </p>
                  <p className="text-xs font-medium text-gray-400">Scheduled Arrival</p>
                </div>
              </div>
            </div>
          </section>

          {/* Passenger Breakdown Card with Black Border */}
          <section className="rounded-3xl border-2 border-black bg-white p-5 shadow-sm dark:border-white dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b-2 border-black pb-3 dark:border-white">
              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                <LuUsers size={16} className="text-brand" /> Passenger Details ({d.passengers.length})
              </span>
              <span className="text-xs font-bold text-gray-500">Assigned Seats</span>
            </div>
            <div className="mt-3 divide-y-2 divide-black/10 dark:divide-white/10">
              {d.passengers.map((p: any) => (
                <div key={p.seatId} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-black text-gray-900 dark:text-white">{p.name}</p>
                    <p className="text-xs font-semibold text-gray-500 dark:text-zinc-400">
                      {p.age} years · {genderLabel(p.gender)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-xl border-2 border-black bg-brand px-3 py-1 text-xs font-black text-white shadow-sm dark:border-white">
                      Seat {p.seatLabel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Fare & Invoice Breakdown Card with Black Border */}
          <section className="rounded-3xl border-2 border-black bg-white p-5 shadow-sm dark:border-white dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b-2 border-black pb-3 dark:border-white">
              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                <LuReceipt size={16} className="text-brand" /> Fare & Invoice Summary
              </span>
              <span className="rounded-full border-2 border-black bg-emerald-100 px-2.5 py-0.5 text-[11px] font-black text-emerald-900 dark:border-white dark:bg-emerald-950 dark:text-emerald-300">
                Paid in full
              </span>
            </div>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between text-gray-600 dark:text-zinc-400">
                <span>Base Ticket Fare</span>
                <span className="font-bold text-gray-900 dark:text-white">{inr(d.price.base)}</span>
              </div>
              <div className="flex justify-between text-gray-600 dark:text-zinc-400">
                <span>GST Taxes (5%)</span>
                <span className="font-bold text-gray-900 dark:text-white">{inr(d.price.gst)}</span>
              </div>
              <div className="flex items-center justify-between border-t-2 border-black/20 pt-3 text-sm font-black dark:border-white/20">
                <span className="text-gray-900 dark:text-white">Total Amount Paid</span>
                <span className="text-lg font-black text-brand">{inr(d.price.total)}</span>
              </div>
            </div>
          </section>

          {/* Action Navigation Buttons with Black Border */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <Link
              to={`/track/${d.id}`}
              className="flex items-center justify-center gap-2 rounded-2xl border-2 border-black bg-white py-3.5 text-xs font-bold text-gray-800 shadow-sm transition hover:bg-gray-50 active:scale-98 dark:border-white dark:bg-zinc-900 dark:text-white"
            >
              <LuRadar size={16} className="text-brand" />
              Live Bus Tracking
            </Link>
            <Link
              to="/trips"
              className="flex items-center justify-center gap-2 rounded-2xl border-2 border-black bg-white py-3.5 text-xs font-bold text-gray-800 shadow-sm transition hover:bg-gray-50 active:scale-98 dark:border-white dark:bg-zinc-900 dark:text-white"
            >
              <LuMapPin size={16} className="text-brand" />
              My Trips & Passes
            </Link>
          </div>
        </div>

        {/* RIGHT COLUMN: The Digital Boarding Pass Card */}
        <div className="space-y-4 lg:col-span-5 lg:sticky lg:top-24">
          {BoardingPassCard}

          {/* Download Ticket CTA Button with Black Border */}
          <button
            onClick={pdf}
            disabled={d.status === 'pending_payment'}
            className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl border-2 border-black bg-brand py-4 text-base font-black text-white shadow-[0_4px_20px_rgba(255,24,64,0.35)] transition hover:bg-brand-500 active:scale-[.99] disabled:opacity-50 dark:border-white"
          >
            <LuDownload size={20} />
            Download Ticket (PDF)
          </button>
        </div>
      </div>
    </div>
  );
}
