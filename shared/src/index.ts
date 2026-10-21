export type Gender = 'male' | 'female' | 'other';
export type Role = 'user' | 'operator' | 'admin';
export type Lang = 'en' | 'ta' | 'ml' | 'kn';
export type SeatType = 'seater' | 'sleeper';
export type BusType = 'seater' | 'sleeper' | 'double-decker' | 'hybrid';

export type BookingStatus =
  | 'held' | 'booked' | 'cancellation_pending' | 'cancelled'
  | 'refund_processing' | 'refund_completed';

export type PaymentMethod = 'external_redirect';

export interface SeatDef {
  id: string;
  label: string;
  type: SeatType;
  position: { row: number; col: number };
  deck: number;
  window: boolean;
  ladiesOnly?: boolean;
}
export interface DeckLayout { deck: number; rows: number; columns: number; aislePosition: number; seats: SeatDef[] }
export interface BusLayout { busType: BusType; decks: DeckLayout[] }
