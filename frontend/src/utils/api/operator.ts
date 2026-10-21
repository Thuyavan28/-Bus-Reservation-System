import type { BusLayout, BusType } from '@busgo/shared';
import { http } from '../http';

/** Operator dashboard. `qs` is "" for operators and "?operatorId=…" when an admin picks an operator. */
export const operatorApi = {
  operators: () => http.get<any[]>('/operator/admin/operators'),

  policy: (qs = '') => http.get<any>(`/operator/policy${qs}`),
  savePolicy: (policy: unknown, qs = '') => http.put(`/operator/policy${qs}`, policy),

  buses: (qs = '') => http.get<any[]>(`/operator/buses${qs}`),
  createBus: (b: unknown, qs = '') => http.post(`/operator/buses${qs}`, b),
  updateBus: (id: string, b: unknown, qs = '') => http.put(`/operator/buses/${id}${qs}`, b),
  layoutPreview: (b: { busType: BusType; rows?: number; columns?: number; aisle?: number }) => http.post<BusLayout>('/operator/buses/layout-preview', b),

  trips: (qs = '') => http.get<any[]>(`/operator/trips${qs}`),
  createTrip: (b: unknown, qs = '') => http.post(`/operator/trips${qs}`, b),
  cancelTrip: (id: string, qs = '') => http.post(`/operator/trips/${id}/cancel${qs}`),
  postLocation: (id: string, lat: number, lng: number, qs = '') => http.post(`/operator/trips/${id}/location${qs}`, { lat, lng }),

  bookings: (qs = '') => http.get<any[]>(`/operator/bookings${qs}`),
  pendingPayments: (qs = '') => http.get<any[]>(`/operator/payments/pending${qs}`),
  cancellations: (qs = '') => http.get<any[]>(`/operator/cancellations${qs}`),
  refunds: (qs = '') => http.get<any[]>(`/operator/refunds${qs}`),
  completeRefund: (reference: string, qs = '') => http.post(`/operator/refunds/${reference}/complete${qs}`),
};
