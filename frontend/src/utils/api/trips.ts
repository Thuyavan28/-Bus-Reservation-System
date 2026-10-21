import type { BusLayout, Gender } from '@busgo/shared';
import { http } from '../http';

export interface TripDetail {
  id: string;
  departureTime: string;
  fares: { seater: number; sleeper: number };
  boarding: any[];
  dropping: any[];
  bus: { name: string; busType: string; ac: boolean };
  operator: { name: string; cancellationFee: number; fallbackPolicy: string };
  from: { name: string; lat: number; lng: number };
  to: { name: string; lat: number; lng: number };
  distanceKm: number | null;
  durationMin: number | null;
  arrivalTime: string | null;
  estimateAvailable: boolean;
  estimateSource?: 'google' | 'osrm' | 'ai' | null;
  /** true for sample (seed / auto-generated) trips, false for operator-published ones */
  demo?: boolean;
  polyline: string | null;
}
export interface SeatInfo {
  /** waiting = cancelled by its passenger, awaiting a replacement (still bookable) */
  state: 'available' | 'waiting' | 'booked' | 'held' | 'unavailable';
  ladiesOnly: boolean;
  allowedGenders: Gender[];
}
export interface SeatsResponse {
  layout: BusLayout;
  seats: Record<string, SeatInfo>;
}
export interface HoldBody {
  seats: { seatId: string; gender: Gender; familyLinked?: boolean }[];
  replaceHoldId?: string;
}

/** /api/trips/* — search and seat inventory are public; hold needs login. */
export const tripsApi = {
  search: (query: URLSearchParams | string) => http.get<any>(`/trips/search?${query}`),
  detail: (id: string) => http.get<TripDetail>(`/trips/${id}`),
  seats: (id: string) => http.get<SeatsResponse>(`/trips/${id}/seats`),
  hold: (id: string, b: HoldBody) => http.post<{ holdId: string; expiresAt: string }>(`/trips/${id}/hold`, b),
  release: (id: string, holdId: string) => http.del(`/trips/${id}/hold/${holdId}`),
  tracking: (id: string) => http.get<any>(`/trips/${id}/tracking`),
};
