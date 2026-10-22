import { Router } from 'express';
import QRCode from 'qrcode';
import { z } from 'zod';
import { env } from '../config/env';
import { Booking, BookingPassenger, CancellationRequest, City, Notification, Passenger, Refund, Trip, User } from '../models';
import { requireAuth } from '../services/auth';
import { cancellationPreview, requestCancellation } from '../services/cancellationService';
import { createBooking } from '../services/bookingService';
import { buildTicketPdf, loadBookingBundle, qrPayload } from '../services/email';
import { asyncHandler, HttpError, parse } from '../utils/http';
import { parseOrigin, publicAppOrigin } from '../utils/network';

const r = Router();

// ── Public: ticket verification by PNR (no login required so any phone scanning the QR can view ticket details) ──
r.get('/bookings/verify/:pnr', asyncHandler(async (req, res) => {
  const pnr = String(req.params.pnr).trim().toUpperCase();
  const b = await Booking.findOne({ $or: [{ pnr }, { _id: pnr.length === 24 ? pnr : undefined }] }).lean();
  if (!b) throw new HttpError(404, 'TICKET_NOT_FOUND', 'No ticket found with this PNR code');
  res.json(await shape(String(b._id)));
}));

r.get('/bookings/verify/:pnr/pdf', asyncHandler(async (req, res) => {
  const pnr = String(req.params.pnr).trim().toUpperCase();
  const b = await Booking.findOne({ $or: [{ pnr }, { _id: pnr.length === 24 ? pnr : undefined }] }).lean();
  if (!b) throw new HttpError(404, 'TICKET_NOT_FOUND');
  if (b.status === 'pending_payment') throw new HttpError(409, 'NOT_PAID');
  res.type('application/pdf').set('Content-Disposition', `attachment; filename=ticket-${b.pnr}.pdf`).send(await buildTicketPdf(String(b._id)));
}));

r.use(requireAuth);

const gender = z.enum(['male', 'female', 'other']);
const phone = z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number');

// ---------- saved passengers ----------
const passengerBody = z.object({ name: z.string().min(2).max(80), age: z.number().int().min(1).max(120), gender, phone, relation: z.string().max(40).optional(), familyLinked: z.boolean().optional() });

r.get('/passengers', asyncHandler(async (req, res) => {
  res.json(await Passenger.find({ userId: req.auth!.id }).sort({ createdAt: 1 }).lean());
}));
r.post('/passengers', asyncHandler(async (req, res) => {
  res.status(201).json(await Passenger.create({ ...parse(passengerBody, req.body), userId: req.auth!.id }));
}));
r.put('/passengers/:id', asyncHandler(async (req, res) => {
  const p = await Passenger.findOneAndUpdate({ _id: req.params.id, userId: req.auth!.id }, { $set: parse(passengerBody, req.body) }, { new: true });
  if (!p) throw new HttpError(404, 'NOT_FOUND');
  res.json(p);
}));
r.delete('/passengers/:id', asyncHandler(async (req, res) => {
  await Passenger.deleteOne({ _id: req.params.id, userId: req.auth!.id });
  res.json({ ok: true });
}));

// ---------- notifications ----------
r.get('/notifications', asyncHandler(async (req, res) => {
  res.json(await Notification.find({ userId: req.auth!.id }).sort({ createdAt: -1 }).limit(50).lean());
}));
r.post('/notifications/read', asyncHandler(async (req, res) => {
  await Notification.updateMany({ userId: req.auth!.id, read: false }, { $set: { read: true } });
  res.json({ ok: true });
}));

// ---------- bookings ----------
r.post('/bookings', asyncHandler(async (req, res) => {
  const b = parse(
    z.object({
      tripId: z.string(), holdId: z.string(), boardingPointId: z.string(), droppingPointId: z.string(),
      passengers: z.array(z.object({ seatId: z.string(), name: z.string().min(2).max(80), age: z.number().int().min(1).max(120), gender, familyLinked: z.boolean().optional() })).min(1).max(6),
      contact: z.object({ name: z.string().min(2), email: z.string().email(), phone }),
    }),
    req.body,
  );
  const booking = await createBooking({ ...b, userId: req.auth!.id });
  res.status(201).json(await shape(String(booking._id)));
}));

async function shape(id: string) {
  const bundle = await loadBookingBundle(id);
  if (!bundle) throw new HttpError(404, 'BOOKING_NOT_FOUND');
  const { booking, trip, passengers, from, to, boarding, dropping, operator } = bundle;
  const cr = await CancellationRequest.findOne({ bookingId: id }).lean();
  const refund = await Refund.findOne({ bookingId: id }).lean();
  return {
    id: String(booking._id), pnr: booking.pnr, status: booking.status, holdExpiresAt: booking.holdExpiresAt,
    price: booking.price, distanceKm: booking.distanceKm ?? null, estimateSource: booking.estimateSource ?? null, durationMin: booking.durationMin ?? null, arrivalTime: booking.arrivalTime ?? null,
    contact: booking.contact, createdAt: (booking as any).createdAt,
    trip: { id: String(trip._id), departureTime: trip.departureTime },
    from: from?.name, to: to?.name, operator: operator?.name,
    boarding, dropping,
    passengers: passengers.map((p) => ({ name: p.name, age: p.age, gender: p.gender, seatId: p.seatId, seatLabel: p.seatLabel, fare: p.fare })),
    cancellation: cr ? { status: cr.status, ticketAmount: cr.ticketAmount, fee: cr.fee, refundAmount: cr.refundAmount, cutoffAt: cr.cutoffAt } : null,
    refund: refund ? { status: refund.status, amount: refund.amount, deduction: refund.deduction, reference: refund.reference } : null,
  };
}

const GROUPS: Record<string, string[]> = {
  upcoming: ['booked'],
  completed: ['booked'],
  cancelled: ['cancelled', 'refund_processing', 'refund_completed'],
  pending: ['cancellation_pending'],
};

r.get('/bookings', asyncHandler(async (req, res) => {
  const tab = String(req.query.tab ?? 'upcoming');
  const statuses = GROUPS[tab] ?? GROUPS.upcoming;
  const mine = await Booking.find({ userId: req.auth!.id, status: { $in: statuses } }).sort({ createdAt: -1 }).lean();
  const trips = await Trip.find({ _id: { $in: mine.map((b) => b.tripId) } }).lean();
  const tm = new Map(trips.map((t) => [String(t._id), t]));
  const now = new Date();
  const filtered = mine.filter((b) => {
    const dep = tm.get(String(b.tripId))?.departureTime;
    if (tab === 'upcoming') return dep && dep > now;
    if (tab === 'completed') return dep && dep <= now;
    return true;
  });
  res.json(await Promise.all(filtered.map((b) => shape(String(b._id)))));
}));

async function own(id: string, userId: string) {
  const b = await Booking.findOne({ _id: id, userId }).lean();
  if (!b) throw new HttpError(404, 'BOOKING_NOT_FOUND');
  return b;
}

r.get('/bookings/:id', asyncHandler(async (req, res) => {
  await own(String(req.params.id), req.auth!.id);
  res.json(await shape(String(req.params.id)));
}));

r.get('/bookings/:id/ticket', asyncHandler(async (req, res) => {
  const b = await own(String(req.params.id), req.auth!.id);
  const origin = parseOrigin(req.get('origin')) ?? parseOrigin(req.get('referer'));
  const { origin: appOrigin } = publicAppOrigin({ configured: env.PUBLIC_APP_URL, requestOrigin: origin, fallback: env.CLIENT_URL });
  const verifyUrl = `${appOrigin}/ticket/verify/${b.pnr}`;
  const qr = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 280, color: { dark: '#000000', light: '#FFFFFF' } });
  res.json({ qr, pnr: b.pnr, verifyUrl });
}));

r.get('/bookings/:id/ticket.pdf', asyncHandler(async (req, res) => {
  const b = await own(String(req.params.id), req.auth!.id);
  if (b.status === 'pending_payment') throw new HttpError(409, 'NOT_PAID');
  res.type('application/pdf').set('Content-Disposition', `attachment; filename=ticket-${b.pnr}.pdf`).send(await buildTicketPdf(String(b._id)));
}));

r.get('/bookings/:id/cancel-preview', asyncHandler(async (req, res) => {
  res.json(await cancellationPreview(String(req.params.id), req.auth!.id));
}));

r.post('/bookings/:id/cancel', asyncHandler(async (req, res) => {
  await requestCancellation(String(req.params.id), req.auth!.id);
  res.status(202).json(await shape(String(req.params.id)));
}));

void City;
void BookingPassenger;
void User;
export default r;
