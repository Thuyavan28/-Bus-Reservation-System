import { env } from '../config/env';
import { City, RouteDistanceCache } from '../models';
import { chatWithFailover } from './ai';
import { haversineKm } from '../utils/geo';
import { HttpError } from '../utils/http';
import { createMemo } from '../utils/memo';

// cities and cached route distances almost never change: skip the remote round trip
const cityMemo = createMemo<any>(5 * 60_000);
const routeHitMemo = createMemo<any>(10 * 60_000);

export interface RouteInfo {
  available: boolean;
  distanceKm?: number;
  durationMin?: number;
  polyline?: string;
  cached?: boolean;
  /** google = Routes API (traffic-aware); ai = Groq estimate, shown to users as approximate. */
  source?: 'google' | 'osrm' | 'ai';
}

interface Pt {
  lat: number;
  lng: number;
}

async function callRoutesApi(a: Pt, b: Pt): Promise<{ distanceKm: number; durationMin: number; polyline: string }> {
  const body = {
    origin: { location: { latLng: { latitude: a.lat, longitude: a.lng } } },
    destination: { location: { latLng: { latitude: b.lat, longitude: b.lng } } },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    departureTime: new Date(Date.now() + 5 * 60_000).toISOString(),
  };
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': env.GOOGLE_MAPS_SERVER_KEY,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Routes API ${res.status}`);
  const json = (await res.json()) as {
    routes?: { duration: string; distanceMeters: number; polyline?: { encodedPolyline: string } }[];
  };
  const r = json.routes?.[0];
  if (!r) throw new Error('Routes API returned no route');
  return {
    distanceKm: Math.round((r.distanceMeters / 1000) * 10) / 10,
    durationMin: Math.round(parseInt(r.duration, 10) / 60),
    polyline: r.polyline?.encodedPolyline ?? '',
  };
}


/** Typical intercity bus vs. car time on the same road (stops, lower average speed). */
export const BUS_TIME_FACTOR = 1.25;

/** Real road geometry + distance from OSRM (OpenStreetMap). Duration is the car time scaled to a bus. */
async function callOsrm(a: Pt, b: Pt): Promise<{ distanceKm: number; durationMin: number; polyline: string }> {
  const url = `${env.OSRM_URL.replace(/\/$/, '')}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=polyline`;
  const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const j = (await res.json()) as { code?: string; routes?: { distance: number; duration: number; geometry: string }[] };
  const r = j.routes?.[0];
  if (j.code !== 'Ok' || !r) throw new Error('OSRM found no route');
  const km = r.distance / 1000;
  if (km < haversineKm(a, b) * 0.98) throw new Error('OSRM distance implausible');
  return { distanceKm: Math.round(km * 10) / 10, durationMin: Math.round((r.duration / 60) * BUS_TIME_FACTOR), polyline: r.geometry };
}

/**
 * HERE Maps Routing API v8 — gives accurate Indian road distances.
 * Tries both API keys; falls through if both fail.
 */
async function callHereMaps(a: Pt, b: Pt): Promise<{ distanceKm: number; durationMin: number; polyline: string }> {
  const keys = [env.HERE_API_KEY_1, env.HERE_API_KEY_2].filter(Boolean);
  if (keys.length === 0) throw new Error('HERE_NOT_CONFIGURED');
  let lastErr: unknown;
  for (const key of keys) {
    try {
      const url = `https://router.hereapi.com/v8/routes?transportMode=car&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&return=summary&apikey=${key}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HERE ${res.status} ${(await res.text().catch(() => '')).slice(0, 80)}`);
      const j = (await res.json()) as {
        routes?: { sections?: { summary?: { length?: number; duration?: number } }[] }[];
      };
      const section = j.routes?.[0]?.sections?.[0]?.summary;
      if (!section?.length || !section?.duration) throw new Error('HERE empty response');
      const km = Math.round((section.length / 1000) * 10) / 10;
      if (km < haversineKm(a, b) * 0.90) throw new Error('HERE distance implausible');
      const durationMin = Math.round((section.duration / 60) * BUS_TIME_FACTOR);
      return { distanceKm: km, durationMin, polyline: '' };
    } catch (e) {
      lastErr = e;
      console.warn('[distance] HERE key failed:', (e as Error).message);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('HERE_FAILED');
}

/**
 * Fallback when no Google key is configured / the Routes API fails: ask Groq for the highway distance
 * and typical bus travel time. The answer is only accepted if it is physically plausible against the
 * straight-line distance and an average bus speed; otherwise we return "unavailable".
 */
export function validateAiEstimate(a: Pt, b: Pt, raw: { distanceKm?: unknown; durationMin?: unknown }) {
  const km = Number(raw.distanceKm);
  const min = Number(raw.durationMin);
  if (!Number.isFinite(km) || !Number.isFinite(min) || km <= 0 || min <= 0) return null;
  const line = haversineKm(a, b);
  if (km < line * 0.98 || km > line * 1.7 + 10) return null; // road can't be shorter than the crow flies
  const speed = km / (min / 60);
  if (speed < 25 || speed > 80) return null; // plausible intercity bus average
  return { distanceKm: Math.round(km * 10) / 10, durationMin: Math.round(min) };
}

async function aiEstimate(from: { name: string; state: string } & Pt, to: { name: string; state: string } & Pt) {
  const text = await chatWithFailover(
    [
      { role: 'system', content: 'You compute driving distances between Indian cities. Think about the real highway route intercity buses use. Reply with ONLY JSON: {"waypoints":[city names along the route in order],"legsKm":[km of each consecutive leg],"distanceKm":sum of legs,"durationMin":typical intercity bus time at 50-55 km/h average including stops}.' },
      { role: 'user', content: `From ${from.name}, ${from.state}, India to ${to.name}, ${to.state}, India.` },
    ],
    fetch,
    { json: true, maxTokens: 1200, temperature: 0 },
  );
  const raw = JSON.parse(text) as { legsKm?: unknown; distanceKm?: unknown; durationMin?: unknown };
  // trust the sum of the legs over the model's own total
  const legs = Array.isArray(raw.legsKm) ? raw.legsKm.map(Number) : [];
  const sum = legs.length && legs.every((n) => Number.isFinite(n) && n > 0) ? legs.reduce((a, b) => a + b, 0) : Number(raw.distanceKm);
  const est = validateAiEstimate(from, to, { distanceKm: sum, durationMin: raw.durationMin });
  if (!est) throw new Error('AI estimate failed plausibility check');
  return est;
}

/**
 * Real distance + traffic-aware duration between two cities, cached in MongoDB for 24h.
 * Never fabricates numbers: any failure yields { available: false }.
 */
export async function getRouteInfo(fromId: string, toId: string): Promise<RouteInfo> {
  const key = `${fromId}:${toId}`;
  const hit = await routeHitMemo.get(key, () => RouteDistanceCache.findOne({ key }).lean());
  if (hit && hit.distanceKm != null && hit.durationMin != null) {
    return { available: true, distanceKm: hit.distanceKm, durationMin: hit.durationMin, polyline: hit.polyline ?? '', cached: true, source: (hit.source as 'google' | 'osrm' | 'ai') ?? 'google' };
  }
  const [from, to] = await Promise.all([City.findById(fromId).lean(), City.findById(toId).lean()]);
  if (!from || !to) return { available: false };

  if (env.GOOGLE_MAPS_SERVER_KEY) {
    try {
      const r = await callRoutesApi(from, to);
      routeHitMemo.delete(key);
      await RouteDistanceCache.updateOne({ key }, { $set: { ...r, source: 'google', createdAt: new Date() } }, { upsert: true });
      return { available: true, ...r, cached: false, source: 'google' };
    } catch (e) {
      console.error('[distance] Google failed:', (e as Error).message);
    }
  }
  if (env.HERE_API_KEY_1 || env.HERE_API_KEY_2) {
    try {
      const r = await callHereMaps(from, to);
      routeHitMemo.delete(key);
      await RouteDistanceCache.updateOne({ key }, { $set: { ...r, source: 'google', createdAt: new Date() } }, { upsert: true });
      return { available: true, ...r, cached: false, source: 'google' };
    } catch (e) {
      console.error('[distance] HERE failed:', (e as Error).message);
    }
  }
  if (env.OSRM_URL) {
    try {
      const r = await callOsrm(from, to);
      routeHitMemo.delete(key);
      await RouteDistanceCache.updateOne({ key }, { $set: { ...r, source: 'osrm', createdAt: new Date() } }, { upsert: true });
      return { available: true, ...r, cached: false, source: 'osrm' };
    } catch (e) {
      console.error('[distance] OSRM failed:', (e as Error).message);
    }
  }
  if (env.GROQ_API_KEY_1 || env.GROQ_API_KEY_2) {
    try {
      const r = await aiEstimate(from, to);
      routeHitMemo.delete(key);
      await RouteDistanceCache.updateOne({ key }, { $set: { ...r, polyline: '', source: 'ai', createdAt: new Date() } }, { upsert: true });
      return { available: true, ...r, polyline: '', cached: false, source: 'ai' };
    } catch (e) {
      console.error('[distance] AI estimate failed:', (e as Error).message);
    }
  }
  return { available: false };
}

export async function resolveCity(idOrSlug: string) {
  const q = /^[a-f\d]{24}$/i.test(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug.toLowerCase() };
  const c = await cityMemo.get(idOrSlug.toLowerCase(), () => City.findOne(q).lean());
  if (!c) {
    cityMemo.delete(idOrSlug.toLowerCase());
    throw new HttpError(404, 'CITY_NOT_FOUND');
  }
  return c;
}

export const arrivalFrom = (departure: Date, durationMin?: number) =>
  durationMin == null ? null : new Date(departure.getTime() + durationMin * 60_000);

/** Drops the in-process caches (tests, and after manual database changes). */
export function resetCaches() {
  cityMemo.clear();
  routeHitMemo.clear();
}
