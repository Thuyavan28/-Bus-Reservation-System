import { z } from 'zod';
import type { BusLayout, BusType, DeckLayout, SeatDef, SeatType } from '@busgo/shared';

const COLS = 'ABCDEFGH';

function grid(deck: number, rows: number, columns: number, aisle: number, type: SeatType, prefix = ''): DeckLayout {
  const seats: SeatDef[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const label = `${prefix}${r + 1}${COLS[c]}`;
      seats.push({
        id: `D${deck}-${label}`,
        label,
        type,
        position: { row: r, col: c },
        deck,
        window: c === 0 || c === columns - 1,
      });
    }
  }
  return { deck, rows, columns, aislePosition: aisle, seats };
}

export interface BuildOpts {
  rows?: number;
  columns?: number;
  aisle?: number;
}

/** Default layouts per bus type; operators can then edit seat-by-seat in the builder. */
export function buildLayout(busType: BusType, o: BuildOpts = {}): BusLayout {
  const rows = o.rows ?? 10;
  switch (busType) {
    case 'seater':
      return { busType, decks: [grid(1, rows, o.columns ?? 4, o.aisle ?? 2, 'seater')] };
    case 'sleeper':
      return {
        busType,
        decks: [grid(1, rows, o.columns ?? 3, o.aisle ?? 2, 'sleeper', 'L'), grid(2, rows, o.columns ?? 3, o.aisle ?? 2, 'sleeper', 'U')],
      };
    case 'double-decker':
      return {
        busType,
        decks: [grid(1, rows, o.columns ?? 4, o.aisle ?? 2, 'seater', 'L'), grid(2, rows, o.columns ?? 4, o.aisle ?? 2, 'seater', 'U')],
      };
    case 'hybrid':
      return {
        busType,
        decks: [grid(1, rows, o.columns ?? 4, o.aisle ?? 2, 'seater', 'L'), grid(2, rows, 3, 2, 'sleeper', 'U')],
      };
  }
}

export const layoutSchema = z
  .object({
    busType: z.enum(['seater', 'sleeper', 'double-decker', 'hybrid']),
    decks: z
      .array(
        z.object({
          deck: z.number().int().min(1).max(3),
          rows: z.number().int().min(1).max(30),
          columns: z.number().int().min(1).max(8),
          aislePosition: z.number().int().min(0).max(8),
          seats: z.array(
            z.object({
              id: z.string().min(1),
              label: z.string().min(1).max(8),
              type: z.enum(['seater', 'sleeper']),
              position: z.object({ row: z.number().int().min(0), col: z.number().int().min(0) }),
              deck: z.number().int(),
              window: z.boolean(),
              ladiesOnly: z.boolean().optional(),
            }),
          ),
        }),
      )
      .min(1)
      .max(3),
  })
  .superRefine((l, ctx) => {
    const ids = new Set<string>();
    const cells = new Set<string>();
    for (const d of l.decks) {
      for (const s of d.seats) {
        if (ids.has(s.id)) ctx.addIssue({ code: 'custom', message: `Duplicate seat id ${s.id}` });
        ids.add(s.id);
        const cell = `${d.deck}:${s.position.row}:${s.position.col}`;
        if (cells.has(cell)) ctx.addIssue({ code: 'custom', message: `Two seats at ${cell}` });
        cells.add(cell);
        if (s.deck !== d.deck) ctx.addIssue({ code: 'custom', message: `Seat ${s.id} deck mismatch` });
        if (s.position.row >= d.rows || s.position.col >= d.columns)
          ctx.addIssue({ code: 'custom', message: `Seat ${s.id} outside grid` });
      }
    }
  });
