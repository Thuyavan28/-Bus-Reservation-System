import { http } from '../http';

export interface City {
  _id: string;
  name: string;
  slug: string;
  state: string;
  lat: number;
  lng: number;
}
export interface Place {
  id: string;
  name: string;
  slug: string;
  state: string;
  lat: number;
  lng: number;
  /** true when the coordinates were geocoded by AI rather than curated */
  approximate?: boolean;
}
export interface CityRef {
  id: string;
  name: string;
  slug: string;
}

/** Cities, popular routes, offers, geolocation lookup, real distance/time, AI assistant. */
export const catalogApi = {
  cities: () => http.get<City[]>('/cities'),
  /** autocomplete for the From/To boxes */
  suggest: (q: string) => http.get<Place[]>(`/places/suggest?q=${encodeURIComponent(q)}`),
  /** turns any typed place into a city (unknown South-Indian towns are geocoded server-side) */
  resolve: (name: string) => http.post<Place>('/places/resolve', { name }),
  popularRoutes: () => http.get<{ from: any; to: any }[]>('/routes/popular'),
  offers: () => http.get<any[]>('/offers'),
  /** nearest city + boarding points for "Use my location" */
  nearest: (lat: number, lng: number) => http.get<any>(`/geo/nearest?lat=${lat}&lng=${lng}`),
  /** Google Routes distance/duration (cached 24h on the server). */
  distance: (from: string, to: string, departure?: string) =>
    http.get<any>(`/routes/distance?from=${from}&to=${to}${departure ? `&departure=${encodeURIComponent(departure)}` : ''}`),
};

export const assistantApi = {
  ask: (message: string, history: { role: 'user' | 'assistant'; content: string }[]) =>
    http.post<{ reply: string }>('/assistant', { message, history }),
};
