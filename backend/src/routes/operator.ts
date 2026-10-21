import { Router } from 'express';
import { z } from 'zod';
import { Booking, BookingPassenger, Bus, CancellationRequest, City, Operator, Payment, Refund, SeatInventory, Trip, User } from '../models';
import { hashPassword, requireRole } from '../services/auth';
import { audit } from '../services/audit';
import { buildLayout, layoutSchema } from '../services/layout';
import { completeRefund } from '../services/refundService';
import { ensureInventory } from '../services/seatService';
import { asyncHandler, HttpError, parse } from '../utils/http';

const r = Router();
r.use(requireRole('operator', 'admin'));

/** Operators are scoped to their own operator; admins pass ?operatorId=. */
function opId(req: any): string {
  const id = req.auth.role === 'admin' ? String(req.query.operatorId ?? req.body?.operatorId ?? '') : req.auth.operatorId;
  if (!id) throw new HttpError(400, 'OPERATOR_REQUIRED', 'operatorId is required for admins');
  return id;
}

r.get('/admin/operators', requireRole('admin'), asyncHandler(async (_req, res) => {
  res.json(await Operator.find().select('name kind').lean());
}));

// ---------- policy ----------
const policyBody = z.object({
  cancellationFee: z.number().min(0).max(5000),
  cutoffHoursBeforeDeparture: z.number().min(0).max(72),
  fallbackPolicy: z.enum(['reject', 'standard_terms']),
  standardRefundPercent: z.number().min(0).max(100),
  holdMinutes: z.number().int().min(5).max(10),
  gender: z.object({ enforce: z.boolean(), femaleAdjacentRestricted: z.boolean(), allowSameBookingAdjacent: z.boolean() }),
});
r.get('/policy', asyncHandler(async (req, res) => {
  const o = await Operator.findById(opId(req)).lean();
  res.json({ name: o?.name, policy: o?.policy });
}));
r.put('/policy', asyncHandler(async (req, res) => {
  const policy = parse(policyBody, req.body);
  const o = await Operator.findByIdAndUpdate(opId(req), { $set: { policy } }, { new: true });
  await audit('operator.policy_updated', { actorId: req.auth!.id, data: policy });
  res.json({ policy: o?.policy });
}));

// ---------- buses & layouts ----------
const busBody = z.object({ name: z.string().min(2), registration: z.string().min(4), busType: z.enum(['seater', 'sleeper', 'double-decker', 'hybrid']), ac: z.boolean().default(true), amenities: z.array(z.string()).default([]), layout: layoutSchema.optional() });
r.get('/buses', asyncHandler(async (req, res) => res.json(await Bus.find({ operatorId: opId(req) }).lean())));
r.post('/buses/layout-preview', asyncHandler(async (req, res) => {
  const b = parse(z.object({ busType: z.enum(['seater', 'sleeper', 'double-decker', 'hybrid']), rows: z.number().int().min(1).max(30).optional(), columns: z.number().int().min(1).max(8).optional(), aisle: z.number().int().min(0).max(8).optional() }), req.body);
  res.json(buildLayout(b.busType, b));
}));
r.post('/buses', asyncHandler(async (req, res) => {
  const b = parse(busBody, req.body);
  res.status(201).json(await Bus.create({ ...b, operatorId: opId(req), layout: b.layout ?? buildLayout(b.busType) }));
}));
r.put('/buses/:id', asyncHandler(async (req, res) => {
  const b = parse(busBody, req.body);
  const bus = await Bus.findOne({ _id: req.params.id, operatorId: opId(req) });
  if (!bus) throw new HttpError(404, 'BUS_NOT_FOUND');
  // Layout edits are blocked once future trips have bookings, to protect sold seats.
  if (b.layout) {
    const trips = await Trip.find({ busId: bus._id, departureTime: { $gt: new Date() } }).select('_id').lean();
    const sold = await SeatInventory.exists({ tripId: { $in: trips.map((t) => t._id) }, status: { $in: ['booked', 'cancellation_pending'] } });
    if (sold) throw new HttpError(409, 'LAYOUT_LOCKED', 'Upcoming trips already have bookings; create a new bus to change the layout');
    // fresh inventory for upcoming (unsold) trips
    for (const t of trips) {
      await SeatInventory.deleteMany({ tripId: t._id });
      await ensureInventory(t._id, b.layout as any);
    }
  }
  Object.assign(bus, { ...b, layout: b.layout ?? bus.layout });
  await bus.save();
  await audit('bus.updated', { actorId: req.auth!.id, data: { busId: bus._id } });
  res.json(bus);
}));

// ---------- trips ----------
r.get('/trips', asyncHandler(async (req, res) => {
  const trips = await Trip.find({ operatorId: opId(req), departureTime: { $gte: new Date(Date.now() - 864e5) } }).sort({ departureTime: 1 }).limit(100).lean();
  const cities = await City.find({ _id: { $in: trips.flatMap((t) => [t.fromCityId, t.toCityId]) } }).select('name').lean();
  const cm = new Map(cities.map((c) => [String(c._id), c.name]));
  res.json(trips.map((t) => ({ id: String(t._id), from: cm.get(String(t.fromCityId)), to: cm.get(String(t.toCityId)), departureTime: t.departureTime, fares: t.fares, status: t.status, busId: t.busId })));
}));
r.post('/trips', asyncHandler(async (req, res) => {
  const b = parse(z.object({ busId: z.string(), fromCityId: z.string(), toCityId: z.string(), departureTime: z.string().datetime(), fares: z.object({ seater: z.number().min(0), sleeper: z.number().min(0) }), boardingOffsetsMin: z.number().min(0).max(60).default(15) }), req.body);
  const [bus, from, to] = await Promise.all([Bus.findOne({ _id: b.busId, operatorId: opId(req) }), City.findById(b.fromCityId), City.findById(b.toCityId)]);
  if (!bus || !from || !to) throw new HttpError(404, 'NOT_FOUND');
  const dep = new Date(b.departureTime);
  const stop = (p: any, t: Date | null) => ({ pointId: String(p._id), name: p.name, landmark: p.landmark, lat: p.lat, lng: p.lng, time: t });
  const route = await (await import('../models')).Route.findOneAndUpdate({ fromCityId: from._id, toCityId: to._id }, { $setOnInsert: { popular: false } }, { upsert: true, new: true });
  const trip = await Trip.create({
    operatorId: opId(req), busId: bus._id, routeId: route!._id, fromCityId: from._id, toCityId: to._id, departureTime: dep, fares: b.fares,
    boarding: from.points.map((p, i) => stop(p, new Date(dep.getTime() - (from.points.length - 1 - i) * b.boardingOffsetsMin * 60_000))),
    dropping: to.points.map((p) => stop(p, null)),
  });
  await ensureInventory(trip._id, bus.layout as any);
  res.status(201).json(trip);
}));
r.post('/trips/:id/cancel', asyncHandler(async (req, res) => {
  const t = await Trip.findOneAndUpdate({ _id: req.params.id, operatorId: opId(req) }, { $set: { status: 'cancelled' } }, { new: true });
  if (!t) throw new HttpError(404, 'TRIP_NOT_FOUND');
  await audit('trip.cancelled', { actorId: req.auth!.id, tripId: t._id });
  res.json(t);
}));
/** Optional real GPS feed: the operator app posts the bus position here. */
r.post('/trips/:id/location', asyncHandler(async (req, res) => {
  const b = parse(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }), req.body);
  const t = await Trip.findOneAndUpdate({ _id: req.params.id, operatorId: opId(req) }, { $set: { location: { ...b, updatedAt: new Date() } } }, { new: true });
  if (!t) throw new HttpError(404, 'TRIP_NOT_FOUND');
  res.json({ ok: true });
}));

// ---------- bookings, payments, cancellations, refunds ----------
r.get('/bookings', asyncHandler(async (req, res) => {
  const bs = await Booking.find({ operatorId: opId(req), status: { $ne: 'pending_payment' } }).sort({ createdAt: -1 }).limit(100).lean();
  const ps = await BookingPassenger.find({ bookingId: { $in: bs.map((b) => b._id) } }).lean();
  res.json(bs.map((b) => ({ id: String(b._id), pnr: b.pnr, status: b.status, total: b.price?.total, contact: b.contact, tripId: b.tripId, passengers: ps.filter((p) => String(p.bookingId) === String(b._id)).map((p) => `${p.name} (${p.gender}) ${p.seatLabel}`) })));
}));
r.get('/payments/pending', asyncHandler(async (req, res) => {
  const bs = await Booking.find({ operatorId: opId(req), status: 'pending_payment' }).select('_id pnr price').lean();
  const ps = await Payment.find({ bookingId: { $in: bs.map((b) => b._id) }, status: 'created' }).lean();
  res.json(ps.map((p) => ({ reference: p.reference, amount: p.amount, bookingId: String(p.bookingId), pnr: bs.find((b) => String(b._id) === String(p.bookingId))?.pnr })));
}));
r.get('/cancellations', asyncHandler(async (req, res) => {
  const bs = await Booking.find({ operatorId: opId(req) }).select('_id pnr').lean();
  const crs = await CancellationRequest.find({ bookingId: { $in: bs.map((b) => b._id) } }).sort({ createdAt: -1 }).limit(100).lean();
  res.json(crs.map((c) => ({ ...c, pnr: bs.find((b) => String(b._id) === String(c.bookingId))?.pnr })));
}));
r.get('/refunds', asyncHandler(async (req, res) => {
  const bs = await Booking.find({ operatorId: opId(req) }).select('_id pnr').lean();
  const rs = await Refund.find({ bookingId: { $in: bs.map((b) => b._id) } }).sort({ createdAt: -1 }).limit(100).lean();
  res.json(rs.map((x) => ({ ...x, pnr: bs.find((b) => String(b._id) === String(x.bookingId))?.pnr })));
}));
r.post('/refunds/:reference/complete', asyncHandler(async (req, res) => {
  const rf = await Refund.findOne({ reference: req.params.reference }).lean();
  const b = rf ? await Booking.findById(rf.bookingId).lean() : null;
  if (!rf || !b) throw new HttpError(404, 'REFUND_NOT_FOUND');
  if (req.auth!.role === 'operator' && String(b.operatorId) !== req.auth!.operatorId) throw new HttpError(403, 'FORBIDDEN');
  await completeRefund(rf.reference, `MANUAL-${rf.reference}`);
  res.json({ ok: true });
}));

// ---------- admin ----------
r.post('/admin/operators', requireRole('admin'), asyncHandler(async (req, res) => {
  const b = parse(z.object({ name: z.string().min(2), kind: z.enum(['government', 'private']), email: z.string().email(), phone: z.string().regex(/^[6-9]\d{9}$/), password: z.string().min(8) }), req.body);
  const op = await Operator.create({ name: b.name, kind: b.kind, contactEmail: b.email });
  await User.create({ name: `${b.name} Admin`, email: b.email, phone: b.phone, gender: 'other', passwordHash: await hashPassword(b.password), role: 'operator', operatorId: op._id });
  res.status(201).json(op);
}));

export default r;
