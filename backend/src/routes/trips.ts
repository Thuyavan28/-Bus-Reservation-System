import { Router } from 'express';
import { z } from 'zod';
import { Bus, City, Operator, SeatInventory, Trip } from '../models';
import { optionalAuth, requireAuth } from '../services/auth';
import { arrivalFrom, getRouteInfo, resolveCity } from '../services/distance';
import { ensureTripsForRoute } from '../services/tripGenerator';
import { holdSeats, loadState, releaseHold, seatMapView } from '../services/seatService';
import { decodePolyline, pointAlong } from '../utils/geo';
import { asyncHandler, HttpError, parse } from '../utils/http';

const r = Router();
const istStart = (date: string) => new Date(`${date}T00:00:00+05:30`);

const BANDS: Record<string, [number, number]> = { morning: [5, 12], afternoon: [12, 17], evening: [17, 21], night: [21, 29] };
const istHour = (d: Date) => new Date(d.getTime() + 19_800_000).getUTCHours();

r.get('/search', asyncHandler(async (req, res) => {
  const q = parse(
    z.object({
      from: z.string(), to: z.string(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      busType: z.string().optional(), ac: z.enum(['true', 'false']).optional(), band: z.string().optional(),
      operator: z.string().optional(), maxPrice: z.coerce.number().optional(),
      sort: z.enum(['departure', 'price', 'duration', 'seats']).default('departure'),
    }),
    req.query,
  );
  const [from, to] = await Promise.all([resolveCity(q.from), resolveCity(q.to)]);
  const start = istStart(q.date);
  const end = new Date(start.getTime() + 864e5);
  const now = new Date();
  const findTrips = () => Trip.find({ fromCityId: from._id, toCityId: to._id, departureTime: { $gte: start > now ? start : now, $lt: end }, status: { $ne: 'cancelled' } }).lean();
  // route info and the day's trips are independent: fetch together
  const [route, firstLook] = await Promise.all([getRouteInfo(String(from._id), String(to._id)), findTrips()]);
  let trips = firstLook;
  if (firstLook.length < 5) {
    await ensureTripsForRoute(from, to, start); // never an empty list: fill in the day's timetable
    trips = await findTrips();
  }

  const [buses, ops, counts] = await Promise.all([
    Bus.find({ _id: { $in: trips.map((t) => t.busId) } }).select('name busType ac amenities').lean(),
    Operator.find({ _id: { $in: trips.map((t) => t.operatorId) } }).select('name kind').lean(),
    SeatInventory.aggregate([
      { $match: { tripId: { $in: trips.map((t) => t._id) }, status: { $in: ['available', 'cancellation_pending'] } } },
      { $match: { $or: [{ holdExpiresAt: { $exists: false } }, { holdExpiresAt: null }, { holdExpiresAt: { $lte: now } }] } },
      { $group: { _id: '$tripId', n: { $sum: 1 } } },
    ]),
  ]);
  const busM = new Map(buses.map((b) => [String(b._id), b]));
  const opM = new Map(ops.map((o) => [String(o._id), o]));
  const cntM = new Map(counts.map((c) => [String(c._id), c.n as number]));

  let rows = trips.map((t) => {
    const bus = busM.get(String(t.busId))!;
    const fares = [t.fares?.seater ?? 0, t.fares?.sleeper ?? 0].filter((f) => f > 0);
    return {
      id: String(t._id),
      operator: opM.get(String(t.operatorId)),
      bus,
      departureTime: t.departureTime,
      // arrival = departure + real API duration; never faked
      arrivalTime: route.available ? arrivalFrom(t.departureTime, route.durationMin) : null,
      distanceKm: route.available ? route.distanceKm : null,
      durationMin: route.available ? route.durationMin : null,
      estimateAvailable: route.available,
      estimateSource: route.available ? route.source : null,
      demo: (t.source ?? 'operator') !== 'operator',
      fares: t.fares,
      minFare: Math.min(...fares),
      seatsLeft: cntM.get(String(t._id)) ?? 0,
      boarding: t.boarding,
      dropping: t.dropping,
    };
  });
  if (q.busType) rows = rows.filter((x) => q.busType!.split(',').includes(x.bus.busType));
  if (q.ac) rows = rows.filter((x) => x.bus.ac === (q.ac === 'true'));
  if (q.operator) rows = rows.filter((x) => String(x.operator?._id) === q.operator);
  if (q.maxPrice) rows = rows.filter((x) => x.minFare <= q.maxPrice!);
  if (q.band) {
    const bands = q.band.split(',').map((b) => BANDS[b]).filter(Boolean);
    if (bands.length) rows = rows.filter((x) => { const h = istHour(x.departureTime); return bands.some(([a, b]) => (h >= a && h < b) || (h + 24 >= a && h + 24 < b)); });
  }
  rows.sort((a, b) => {
    switch (q.sort) {
      case 'price': return a.minFare - b.minFare;
      case 'duration': return (a.durationMin ?? 1e9) - (b.durationMin ?? 1e9);
      case 'seats': return b.seatsLeft - a.seatsLeft;
      default: return +a.departureTime - +b.departureTime;
    }
  });
  res.json({
    from: { id: String(from._id), name: from.name, lat: from.lat, lng: from.lng },
    to: { id: String(to._id), name: to.name, lat: to.lat, lng: to.lng },
    route: route.available ? { distanceKm: route.distanceKm, durationMin: route.durationMin, polyline: route.polyline, source: route.source } : null,
    demo: rows.length > 0 && rows.every((x) => x.demo),
    trips: rows,
  });
}));

r.get('/:id', asyncHandler(async (req, res) => {
  const t = await Trip.findById(req.params.id).lean();
  if (!t) throw new HttpError(404, 'TRIP_NOT_FOUND');
  const [bus, operator, from, to, route] = await Promise.all([
    Bus.findById(t.busId).lean(), Operator.findById(t.operatorId).select('name kind policy').lean(),
    City.findById(t.fromCityId).lean(), City.findById(t.toCityId).lean(), getRouteInfo(String(t.fromCityId), String(t.toCityId)),
  ]);
  res.json({
    id: String(t._id), departureTime: t.departureTime, status: t.status, fares: t.fares, boarding: t.boarding,
    dropping: t.dropping.map((d: any, i: number) => ({ ...d, time: route.available ? new Date(t.departureTime.getTime() + (route.durationMin! + i * 10) * 60_000) : null })),
    bus: { name: bus?.name, busType: bus?.busType, ac: bus?.ac, amenities: bus?.amenities },
    operator: { id: String(operator?._id), name: operator?.name, kind: operator?.kind, cancellationFee: operator?.policy?.cancellationFee, fallbackPolicy: operator?.policy?.fallbackPolicy, cutoffHours: operator?.policy?.cutoffHoursBeforeDeparture, holdMinutes: operator?.policy?.holdMinutes },
    from: { id: String(from?._id), name: from?.name, lat: from?.lat, lng: from?.lng },
    to: { id: String(to?._id), name: to?.name, lat: to?.lat, lng: to?.lng },
    distanceKm: route.available ? route.distanceKm : null,
    durationMin: route.available ? route.durationMin : null,
    arrivalTime: route.available ? arrivalFrom(t.departureTime, route.durationMin) : null,
    estimateAvailable: route.available,
    estimateSource: route.available ? route.source : null,
    demo: (t.source ?? 'operator') !== 'operator',
    polyline: route.available ? route.polyline : null,
  });
}));

/** Layout + live seat states. allowedGenders lets the UI hide seats the passenger cannot take. */
r.get('/:id/seats', asyncHandler(async (req, res) => {
  const state = await loadState(String(req.params.id));
  res.json({ layout: state.layout, seats: seatMapView(state), policy: state.policy, holdMinutes: state.operator.policy?.holdMinutes ?? 8 });
}));

r.post('/:id/hold', requireAuth, asyncHandler(async (req, res) => {
  const b = parse(
    z.object({
      seats: z.array(z.object({ seatId: z.string(), gender: z.enum(['male', 'female', 'other']), familyLinked: z.boolean().optional() })).min(1).max(6),
      replaceHoldId: z.string().optional(),
    }),
    req.body,
  );
  const out = await holdSeats({
    userId: req.auth!.id,
    tripId: String(req.params.id),
    selections: b.seats.map((s) => ({ seatId: s.seatId, gender: s.gender, familyGroupId: s.familyLinked ? `family:${req.auth!.id}` : null })),
    replaceHoldId: b.replaceHoldId,
  });
  res.status(201).json(out);
}));

r.delete('/:id/hold/:holdId', requireAuth, asyncHandler(async (req, res) => {
  await releaseHold(String(req.params.holdId), req.auth!.id);
  res.json({ ok: true });
}));

/**
 * Live tracking. Uses the operator-reported GPS fix when fresh (<5 min); otherwise the position is
 * interpolated along the real route polyline from departure -> arrival time and flagged as simulated.
 */
r.get('/:id/tracking', optionalAuth, asyncHandler(async (req, res) => {
  const t = await Trip.findById(req.params.id).lean();
  if (!t) throw new HttpError(404, 'TRIP_NOT_FOUND');
  const route = await getRouteInfo(String(t.fromCityId), String(t.toCityId));
  if (!route.available || !route.polyline) return res.json({ available: false, message: route.available ? 'Live route map needs the Google Maps key (only an approximate distance is available)' : 'Estimate unavailable' });
  const path = decodePolyline(route.polyline);
  const dep = t.departureTime.getTime();
  const arr = dep + route.durationMin! * 60_000;
  const now = Date.now();
  const fresh = t.location?.updatedAt && now - t.location.updatedAt.getTime() < 5 * 60_000;
  const progress = Math.min(Math.max((now - dep) / (arr - dep), 0), 1);
  const position = fresh ? { lat: t.location!.lat!, lng: t.location!.lng! } : pointAlong(path, progress);
  const step = Math.max(1, Math.floor(path.length / 400));
  res.json({
    available: true,
    source: fresh ? 'gps' : 'simulated',
    status: now < dep ? 'not_started' : now >= arr ? 'arrived' : 'running',
    progress, position, path: path.filter((_, i) => i % step === 0 || i === path.length - 1),
    etaTime: new Date(arr), departureTime: t.departureTime,
    distanceKm: route.distanceKm, durationMin: route.durationMin,
    remainingMin: Math.max(0, Math.round((arr - Math.max(now, dep)) / 60_000)),
  });
}));

export default r;
