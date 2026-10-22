import i18n from '../i18n';

const IST = 'Asia/Kolkata';

const BUS_TYPE: Record<string, string> = { seater: 'Seater', sleeper: 'Sleeper', 'double-decker': 'Double-decker', hybrid: 'Hybrid' };
export const busTypeLabel = (x: string) => i18n.t(BUS_TYPE[x] ?? x);
const BAND: Record<string, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Night' };
export const bandLabel = (x: string) => i18n.t(BAND[x] ?? x);
const GENDER_LABEL: Record<string, string> = { male: 'Male', female: 'Female', other: 'Other' };
export const genderLabel = (x?: string | null) => (x ? i18n.t(GENDER_LABEL[x] ?? x) : '');

/** Place name in the active language (falls back to the English name). */
export const tp = (name?: string | null): string => {
  if (!name) return '';
  if (i18n.exists(name)) return i18n.t(name);
  const m = name.match(/^(.*) Bus Stand$/);
  return m ? i18n.t('{{city}} Bus Stand', { city: tp(m[1]) }) : name;
};

/** BCP-47 locale for dates / numbers in the language the user picked. */
export const loc = () => ({ ta: 'ta-IN', ml: 'ml-IN', kn: 'kn-IN' } as Record<string, string>)[i18n.language] ?? 'en-IN';

export const inr = (n?: number | null) => (n == null ? '—' : `₹${n.toLocaleString(loc())}`);

export const time = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleTimeString(loc(), { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: true }) : '—';

export const dateTime = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleString(loc(), { timeZone: IST, dateStyle: 'medium', timeStyle: 'short' }) : '—';

export const shortDate = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleDateString(loc(), { timeZone: IST, weekday: 'short', day: 'numeric', month: 'short' }) : '—';

export const duration = (min?: number | null) => (min == null ? null : i18n.t('{{h}}h {{m}}m', { h: Math.floor(min / 60), m: String(min % 60).padStart(2, '0') }));

export const dayStr = (d: string | Date) =>
  new Date(d).toLocaleDateString(loc(), {
    timeZone: IST,
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

/** yyyy-mm-dd for N days from today (IST). */
export const isoPlus = (days: number) => new Date(Date.now() + 19_800_000 + days * 864e5).toISOString().slice(0, 10);

export function decodePolyline(str: string): { lat: number; lng: number }[] {
  const pts: { lat: number; lng: number }[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  while (i < str.length) {
    for (const axis of [0, 1]) {
      let shift = 0;
      let result = 0;
      let byte: number;
      do {
        byte = str.charCodeAt(i++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += d;
      else lng += d;
    }
    pts.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return pts;
}

/** "≈ " when the time (or distance) is an estimate: bus time on a real road route, or an AI estimate. */
export const approx = (source?: string | null) => (source === 'ai' || source === 'osrm' ? '≈ ' : '');
export const estTag = (source?: string | null) => i18n.t(source === 'ai' ? 'AI estimate · approximate' : source === 'osrm' ? 'road route · bus time estimated' : 'live traffic');

/** Server notification text: fixed sentences and PNR / amount patterns are translated, the rest is shown as-is. */
export const noteBody = (text?: string | null) => {
  if (!text) return '';
  if (i18n.exists(text)) return i18n.t(text);
  let m = text.match(/^PNR (.+)$/);
  if (m) return i18n.t('PNR {{pnr}}', { pnr: m[1] });
  m = text.match(/^Seat replaced\. Refund ₹([\d,.]+) is processing\.$/);
  if (m) return i18n.t('Seat replaced. Refund ₹{{amount}} is processing.', { amount: m[1] });
  m = text.match(/^₹([\d,.]+) refunded$/);
  if (m) return i18n.t('₹{{amount}} refunded', { amount: m[1] });
  return text;
};
