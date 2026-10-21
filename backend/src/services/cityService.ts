import { City } from '../models';
import { PLACES, SERVICE_BOX, slugify } from '../data/places';
import { HttpError } from '../utils/http';
import { chatWithFailover } from './ai';

const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const defaultPoint = (name: string, lat: number, lng: number) => ({ name: `${name} Bus Stand`, landmark: 'Main bus stand', lat, lng, kind: 'both' });

/** Adds the built-in town list. Existing cities (with hand-made boarding points) are left untouched. */
export async function ensureCities() {
  const have = new Set((await City.find().select('slug').lean()).map((c) => c.slug));
  const docs = PLACES.filter(([name]) => !have.has(slugify(name))).map(([name, state, lat, lng, aliases]) => ({
    name, slug: slugify(name), state, lat, lng, aliases, source: 'builtin', points: [defaultPoint(name, lat, lng)],
  }));
  if (docs.length) await City.insertMany(docs, { ordered: false });
  // make sure aliases exist on older rows
  for (const [name, , , , aliases] of PLACES) if (aliases.length) await City.updateOne({ slug: slugify(name) }, { $addToSet: { aliases: { $each: aliases } } });
  return docs.length;
}

export async function suggestCities(q: string, limit = 8) {
  const text = q.trim().slice(0, 40);
  if (!text) return City.find().sort({ name: 1 }).limit(limit).select('name slug state lat lng').lean();
  const rx = escapeRx(text);
  const rows = await City.find({ $or: [{ name: new RegExp(`^${rx}`, 'i') }, { aliases: new RegExp(`^${rx}`, 'i') }, { name: new RegExp(rx, 'i') }, { aliases: new RegExp(rx, 'i') }] })
    .select('name slug state lat lng aliases')
    .limit(40)
    .lean();
  const lower = text.toLowerCase();
  const rank = (c: { name: string; aliases?: string[] | null }) => (c.name.toLowerCase().startsWith(lower) ? 0 : (c.aliases ?? []).some((a) => a.toLowerCase().startsWith(lower)) ? 1 : 2);
  return rows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).slice(0, limit);
}

const titleCase = (s: string) => s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

export function validateGeocode(raw: { found?: unknown; name?: unknown; state?: unknown; lat?: unknown; lng?: unknown }) {
  if (raw.found === false) return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < SERVICE_BOX.minLat || lat > SERVICE_BOX.maxLat || lng < SERVICE_BOX.minLng || lng > SERVICE_BOX.maxLng) return null;
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 40) : '';
  if (!name || !/^[\p{L} .'-]+$/u.test(name)) return null;
  return { name: titleCase(name), state: typeof raw.state === 'string' ? raw.state.slice(0, 40) : 'India', lat: Math.round(lat * 1e4) / 1e4, lng: Math.round(lng * 1e4) / 1e4 };
}

/**
 * Turns whatever the user typed into a City. Known towns / aliases resolve locally; unknown towns in South
 * India are geocoded by Groq (coordinates validated against the service area) and saved for next time.
 */
export async function resolvePlace(input: string) {
  const text = input.trim().replace(/\s+/g, ' ');
  if (text.length < 2 || text.length > 60 || !/^[\p{L}0-9 .,'()-]+$/u.test(text)) throw new HttpError(400, 'BAD_PLACE', 'Type a valid place name');
  const key = text.toLowerCase().replace(/,.*$/, '').trim(); // "Salem, Tamil Nadu" -> "salem"
  const slug = slugify(key);

  const exact = await City.findOne({ $or: [{ slug }, { name: new RegExp(`^${escapeRx(key)}$`, 'i') }, { aliases: new RegExp(`^${escapeRx(key)}$`, 'i') }] });
  if (exact) return exact;
  const starts = await City.find({ $or: [{ name: new RegExp(`^${escapeRx(key)}`, 'i') }, { aliases: new RegExp(`^${escapeRx(key)}`, 'i') }] }).limit(2);
  if (starts.length === 1 && key.length >= 3) return starts[0];

  let geo: ReturnType<typeof validateGeocode> = null;
  try {
    const out = await chatWithFailover(
      [
        { role: 'system', content: 'You geocode towns in South India (Tamil Nadu, Karnataka, Kerala, Andhra Pradesh, Telangana, Puducherry). Reply with ONLY JSON: {"found": boolean, "name": proper English spelling of the town, "state": state, "lat": number, "lng": number}. If the text is not a real town or city in this region, reply {"found": false}.' },
        { role: 'user', content: text },
      ],
      fetch,
      { json: true, maxTokens: 600, temperature: 0 },
    );
    geo = validateGeocode(JSON.parse(out));
  } catch (e) {
    console.error('[places] geocode failed:', (e as Error).message);
  }
  if (!geo) throw new HttpError(404, 'PLACE_NOT_FOUND', `We could not find "${text}" in Tamil Nadu, Karnataka or Kerala. Check the spelling or pick from the suggestions.`);

  const geoSlug = slugify(geo.name);
  const dup = await City.findOne({ slug: geoSlug });
  if (dup) return dup;
  return City.create({ name: geo.name, slug: geoSlug, state: geo.state, lat: geo.lat, lng: geo.lng, aliases: [key], source: 'ai', points: [defaultPoint(geo.name, geo.lat, geo.lng)] });
}
