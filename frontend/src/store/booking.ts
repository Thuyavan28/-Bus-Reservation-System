import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Gender } from '@busgo/shared';
import type { CityRef } from '../utils/api';

export type { CityRef };
export interface PaxSlot {
  gender: Gender;
  seatId?: string;
}

const todayIso = () => new Date(Date.now() + 19_800_000).toISOString().slice(0, 10); // IST date

interface BookingState {
  from: CityRef | null;
  to: CityRef | null;
  date: string;
  pax: PaxSlot[];
  tripId: string | null;
  holdId: string | null;
  holdExpiresAt: string | null;
  boardingPointId: string | null;
  droppingPointId: string | null;
  set: (p: Partial<BookingState>) => void;
  swap: () => void;
  setPaxCount: (n: number, defaultGender: Gender) => void;
  clearSelection: () => void;
}

export const useBooking = create<BookingState>()(
  persist(
    (set, get) => ({
      from: null,
      to: null,
      date: todayIso(),
      pax: [{ gender: 'male' }],
      tripId: null,
      holdId: null,
      holdExpiresAt: null,
      boardingPointId: null,
      droppingPointId: null,
      set: (p) => set(p),
      swap: () => set({ from: get().to, to: get().from }),
      setPaxCount(n, g) {
        const cur = get().pax;
        set({ pax: Array.from({ length: n }, (_, i) => cur[i] ?? { gender: g }) });
      },
      clearSelection: () =>
        set({ tripId: null, holdId: null, holdExpiresAt: null, boardingPointId: null, droppingPointId: null, pax: get().pax.map((p) => ({ gender: p.gender })) }),
    }),
    { name: 'busgo-booking', storage: createJSONStorage(() => sessionStorage) },
  ),
);

export { todayIso };
