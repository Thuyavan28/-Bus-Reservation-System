import type { Gender } from '@busgo/shared';
import { http } from '../http';

export type BookingTab = 'upcoming' | 'completed' | 'cancelled' | 'pending';

export interface CreateBookingBody {
  tripId: string;
  holdId: string;
  boardingPointId: string;
  droppingPointId: string;
  passengers: { seatId: string; name: string; age: number; gender: Gender; familyLinked?: boolean }[];
  contact: { name: string; email: string; phone: string };
}
export interface PassengerBody {
  name: string;
  age: number;
  gender: Gender;
  phone: string;
  relation?: string;
  familyLinked?: boolean;
}

/** Bookings, ticket, cancellation. All need login. */
export const bookingsApi = {
  create: (b: CreateBookingBody) => http.post<{ id: string }>('/bookings', b),
  list: (tab: BookingTab) => http.get<any[]>(`/bookings?tab=${tab}`),
  get: (id: string) => http.get<any>(`/bookings/${id}`),
  ticket: (id: string) => http.get<{ qr: string; pnr: string }>(`/bookings/${id}/ticket`),
  ticketPdf: (id: string) => http.blob(`/bookings/${id}/ticket.pdf`),
  cancelPreview: (id: string) => http.get<any>(`/bookings/${id}/cancel-preview`),
  cancel: (id: string) => http.post(`/bookings/${id}/cancel`),
};

export const passengersApi = {
  list: () => http.get<any[]>('/passengers'),
  create: (b: PassengerBody) => http.post('/passengers', b),
  update: (id: string, b: PassengerBody) => http.put(`/passengers/${id}`, b),
  remove: (id: string) => http.del(`/passengers/${id}`),
};

export const notificationsApi = {
  list: () => http.get<any[]>('/notifications'),
  markAllRead: () => http.post('/notifications/read'),
};
