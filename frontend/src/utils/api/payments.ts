import { http } from '../http';

export interface InitiatedPayment {
  reference: string;
  amount: number;
  /** external payment website (secondary option) */
  redirectUrl: string;
  /** page opened by scanning the QR: accept or reject */
  approveUrl: string;
  /** QR code image (data URL) that encodes approveUrl */
  qr: string;
  /** false when the QR address only works on this computer (no network address found) */
  reachable: boolean;
}
export interface ApprovalInfo {
  merchant: string;
  reference: string;
  amount: number;
  status: 'created' | 'success' | 'failed' | 'expired';
  route: string;
  departureTime: string | null;
  seats: string[];
  expiresAt: string | null;
  pnr?: string;
}

/** Payments: QR scan -> accept/reject page (primary) or redirect to an external payment website. */
export const paymentsApi = {
  initiate: (bookingId: string, idempotencyKey: string) => http.post<InitiatedPayment>('/payments/initiate', { bookingId }, { 'Idempotency-Key': idempotencyKey }),
  status: (reference: string) => http.get<any>(`/payments/${reference}`),
  /** public (the token in the QR is the credential) */
  approvalInfo: (token: string) => http.get<ApprovalInfo>(`/payments/approve/${token}`),
  decide: (token: string, decision: 'accept' | 'reject') => http.post<{ status: 'success' | 'failed'; duplicate: boolean }>(`/payments/approve/${token}`, { decision }),
  /** operator/admin manual approval */
  approve: (reference: string) => http.post(`/payments/${reference}/approve`),
};
