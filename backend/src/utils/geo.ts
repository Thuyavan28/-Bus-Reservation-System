export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Decode a Google encoded polyline. */
export function decodePolyline(str: string): { lat: number; lng: number }[] {
  const pts: { lat: number; lng: number }[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  while (i < str.length) {
    for (const axis of ['lat', 'lng'] as const) {
      let shift = 0;
      let result = 0;
      let byte: number;
      do {
        byte = str.charCodeAt(i++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 'lat') lat += d;
      else lng += d;
    }
    pts.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return pts;
}

/** Point at fraction f (0..1) of the way along a path, by distance. */
export function pointAlong(path: { lat: number; lng: number }[], f: number) {
  if (path.length === 0) return null;
  if (f <= 0) return path[0];
  if (f >= 1) return path[path.length - 1];
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = haversineKm(path[i - 1], path[i]);
    seg.push(d);
    total += d;
  }
  let target = total * f;
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i]) {
      const t = seg[i] === 0 ? 0 : target / seg[i];
      return {
        lat: path[i].lat + (path[i + 1].lat - path[i].lat) * t,
        lng: path[i].lng + (path[i + 1].lng - path[i].lng) * t,
      };
    }
    target -= seg[i];
  }
  return path[path.length - 1];
}
