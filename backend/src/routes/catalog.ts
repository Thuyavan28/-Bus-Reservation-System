import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env';
import { City, Route } from '../models';
import { chatWithFailover, ASSISTANT_SYSTEM_PROMPT } from '../services/ai';
import { arrivalFrom, getRouteInfo, resolveCity } from '../services/distance';
import { asyncHandler, HttpError, parse } from '../utils/http';
import { haversineKm } from '../utils/geo';
import { resolvePlace, suggestCities } from '../services/cityService';

const r = Router();

r.get('/cities', asyncHandler(async (_req, res) => {
  res.json(await City.find().select('name slug state lat lng points').sort({ name: 1 }).lean());
}));

/** Real distance + traffic-aware duration (Google Routes API, cached 24h). */
r.get('/routes/distance', asyncHandler(async (req, res) => {
  const q = parse(z.object({ from: z.string().min(1), to: z.string().min(1), departure: z.string().datetime().optional() }), req.query);
  const [from, to] = await Promise.all([resolveCity(q.from), resolveCity(q.to)]);
  const info = await getRouteInfo(String(from._id), String(to._id));
  const arrival = q.departure && info.available ? arrivalFrom(new Date(q.departure), info.durationMin) : null;
  res.json({ from: from.name, to: to.name, ...info, arrivalTime: arrival, message: info.available ? undefined : 'Estimate unavailable' });
}));

r.get('/routes/popular', asyncHandler(async (_req, res) => {
  const rs = await Route.find({ popular: true }).lean();
  const cities = await City.find().select('name slug').lean();
  const m = new Map(cities.map((c) => [String(c._id), c]));
  res.json(rs.map((x) => ({ from: m.get(String(x.fromCityId)), to: m.get(String(x.toCityId)) })));
}));

/** "Use my location": nearest city + boarding points (works even without Google; address label if a key exists). */
r.get('/geo/nearest', asyncHandler(async (req, res) => {
  const q = parse(z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }), req.query);
  const cities = await City.find().lean();
  const ranked = cities.map((c) => ({ c, d: haversineKm(q, c) })).sort((a, b) => a.d - b.d);
  const near = ranked[0];
  if (!near) throw new HttpError(404, 'NO_CITIES');
  const points = near.c.points.map((p) => ({ id: String(p._id), name: p.name, landmark: p.landmark, lat: p.lat, lng: p.lng, distanceKm: Math.round(haversineKm(q, p) * 10) / 10 })).sort((a, b) => a.distanceKm - b.distanceKm);
  let address: string | null = null;
  if (env.GOOGLE_MAPS_SERVER_KEY) {
    try {
      const g = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${q.lat},${q.lng}&key=${env.GOOGLE_MAPS_SERVER_KEY}`, { signal: AbortSignal.timeout(5000) });
      const j = (await g.json()) as { results?: { formatted_address: string }[] };
      address = j.results?.[0]?.formatted_address ?? null;
    } catch {
      address = null;
    }
  }
  res.json({
    city: { id: String(near.c._id), name: near.c.name, slug: near.c.slug, lat: near.c.lat, lng: near.c.lng },
    distanceToCityKm: Math.round(near.d * 10) / 10,
    withinServiceArea: near.d <= 60,
    address,
    boardingPoints: points,
  });
}));

const publicCity = (c: any) => ({ id: String(c._id), name: c.name, slug: c.slug, state: c.state, lat: c.lat, lng: c.lng, approximate: c.source === 'ai' });

/** Autocomplete for the From/To boxes. */
r.get('/places/suggest', asyncHandler(async (req, res) => {
  const { q } = parse(z.object({ q: z.string().max(40).default('') }), req.query);
  res.json((await suggestCities(q)).map(publicCity));
}));

/** Resolves anything the user typed into a city (geocodes unknown South-Indian towns with Groq). */
const placeLimiter = rateLimit({ windowMs: 60_000, limit: 20, skip: () => env.NODE_ENV === 'test' });
r.post('/places/resolve', placeLimiter, asyncHandler(async (req, res) => {
  const { name } = parse(z.object({ name: z.string().min(2).max(60) }), req.body);
  res.json(publicCity(await resolvePlace(name)));
}));

r.get('/offers', (_req, res) => {
  res.json([
    { id: 'first', code: 'FIRST50', title: 'Flat ₹50 off your first booking', note: 'Display only — apply at checkout is not enabled yet' },
    { id: 'women', title: 'Ladies-only seats on every bus', note: 'Reserved rows on lower deck' },
    { id: 'sleeper', title: 'AC Sleepers from ₹950', note: 'Bengaluru ⇄ Kochi' },
  ]);
});

const assistantLimiter = rateLimit({ windowMs: 60_000, limit: 10 });
r.post('/assistant', assistantLimiter, asyncHandler(async (req, res) => {
  const b = parse(z.object({ message: z.string().min(1).max(500), history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(800) })).max(8).optional() }), req.body);
  try {
    const reply = await chatWithFailover([{ role: 'system', content: ASSISTANT_SYSTEM_PROMPT }, ...(b.history ?? []), { role: 'user', content: b.message }]);
    res.json({ reply });
  } catch {
    res.status(503).json({ error: 'AI_UNAVAILABLE', message: 'Assistant is unavailable right now.' });
  }
}));

export default r;
