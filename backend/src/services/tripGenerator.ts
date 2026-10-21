import { Bus, Route, Trip } from '../models';
import { haversineKm } from '../utils/geo';
import { getRouteInfo } from './distance';
import { ensureInventory } from './seatService';
import { createMemo } from '../utils/memo';

const busesMemo = createMemo<any[]>(60 * 60_000);

/** Daily departure slots (IST hh:mm). */
export const SLOTS: [number, number][] = [[5, 30], [8, 0], [13, 30], [17, 0], [21, 0], [22, 45]];
const MIN_TRIPS = 5;

const PER_KM: Record<string, { seater: number; sleeper: number }> = {
  seater: { seater: 1.1, sleeper: 0 },
  sleeper: { seater: 0, sleeper: 2.0 },
  'double-decker': { seater: 1.5, sleeper: 0 },
  hybrid: { seater: 1.4, sleeper: 2.2 },
};

export function fareFor(busType: string, distanceKm: number) {
  const k = PER_KM[busType] ?? PER_KM.seater;
  const r = (rate: number) => (rate ? Math.max(120, Math.round((distanceKm * rate) / 10) * 10) : 0);
  return { seater: r(k.seater), sleeper: r(k.sleeper) };
}

const inflight = new Map<string, Promise<number>>();

/**
 * Makes sure a route has a sensible timetable for the given IST day so users never see an empty list.
 * Missing departures are created on the fly using the existing fleet; fares scale with real distance.
 * Trips already published by operators are kept and counted.
 */
export function ensureTripsForRoute(from: any, to: any, dayStart: Date): Promise<number> {
  const key = `${from._id}:${to._id}:${dayStart.toISOString()}`;
  let p = inflight.get(key);
  if (!p) {
    p = generate(from, to, dayStart).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

async function generate(from: any, to: any, dayStart: Date): Promise<number> {
  const dayEnd = new Date(dayStart.getTime() + 864e5);
  const existing = await Trip.find({ fromCityId: from._id, toCityId: to._id, departureTime: { $gte: dayStart, $lt: dayEnd }, status: { $ne: 'cancelled' } }).select('departureTime').lean();
  if (existing.length >= MIN_TRIPS) return 0;
  const [buses, route, info] = await Promise.all([
    busesMemo.get('all', () => Bus.find().lean()),
    Route.findOneAndUpdate({ fromCityId: from._id, toCityId: to._id }, { $setOnInsert: { popular: false } }, { upsert: true, new: true }),
    getRouteInfo(String(from._id), String(to._id)),
  ]);
  if (!buses.length) return 0;

  const km = info.available ? info.distanceKm! : Math.round(haversineKm(from, to) * 1.25);
  const now = Date.now();
  const stop = (p: any, t: Date | null) => ({ pointId: String(p._id), name: p.name, landmark: p.landmark, lat: p.lat, lng: p.lng, time: t });
  const seed = (from.slug.length * 7 + to.slug.length * 3) % buses.length;

  // every slot is independent: create them all concurrently instead of one DB round trip at a time
  const made = await Promise.all(SLOTS.map(async ([h, m], i) => {
    const dep = new Date(dayStart.getTime() + (h * 60 + m) * 60_000);
    if (dep.getTime() < now) return 0;
    if (existing.some((t) => Math.abs(+t.departureTime - +dep) < 45 * 60_000)) return 0;
    const bus: any = buses[(seed + i) % buses.length];
    const trip = await Trip.create({
      operatorId: bus.operatorId, busId: bus._id, routeId: route!._id, fromCityId: from._id, toCityId: to._id, departureTime: dep,
      source: 'auto',
      fares: fareFor(bus.busType, km),
      boarding: from.points.map((p: any, j: number) => stop(p, new Date(dep.getTime() - (from.points.length - 1 - j) * 15 * 60_000))),
      dropping: to.points.map((p: any) => stop(p, null)),
    });
    await ensureInventory(trip._id, bus.layout.toObject ? bus.layout.toObject() : bus.layout);
    return 1;
  }));
  return made.reduce<number>((a, b) => a + b, 0);
}
