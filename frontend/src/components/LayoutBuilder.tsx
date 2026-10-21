import { useState } from 'react';
import type { BusLayout, BusType, DeckLayout, SeatDef } from '@busgo/shared';
import { operatorApi } from '../utils/api';
import { SeatBox } from './SeatMap';
import { Button } from './ui';

type Tool = 'seater' | 'sleeper' | 'ladies' | 'rename' | 'erase';
const COLS = 'ABCDEFGH';

/** Operator layout editor: choose bus type + grid, then paint seats, ladies-only rows, labels, decks. */
export default function LayoutBuilder({ value, onChange }: { value: BusLayout; onChange: (l: BusLayout) => void }) {
  const [tool, setTool] = useState<Tool>('seater');
  const [deckIdx, setDeckIdx] = useState(0);
  const deck = value.decks[deckIdx] ?? value.decks[0];

  const patchDeck = (d: DeckLayout) => onChange({ ...value, decks: value.decks.map((x, i) => (i === deckIdx ? d : x)) });

  async function regenerate(busType: BusType, rows?: number, columns?: number, aisle?: number) {
    onChange(await operatorApi.layoutPreview({ busType, rows, columns, aisle }));
    setDeckIdx(0);
  }

  function clickCell(row: number, col: number) {
    const existing = deck.seats.find((s) => s.position.row === row && s.position.col === col);
    if (tool === 'erase') return existing && patchDeck({ ...deck, seats: deck.seats.filter((s) => s !== existing) });
    if (!existing) {
      if (tool === 'rename' || tool === 'ladies') return;
      const label = `${row + 1}${COLS[col]}`;
      const seat: SeatDef = { id: `D${deck.deck}-N${row}-${col}`, label, type: tool, position: { row, col }, deck: deck.deck, window: col === 0 || col === deck.columns - 1 };
      return patchDeck({ ...deck, seats: [...deck.seats, seat] });
    }
    if (tool === 'rename') {
      const label = window.prompt('Seat label (max 8 chars)', existing.label)?.trim().slice(0, 8);
      return label && patchDeck({ ...deck, seats: deck.seats.map((s) => (s === existing ? { ...s, label } : s)) });
    }
    if (tool === 'ladies') return patchDeck({ ...deck, seats: deck.seats.map((s) => (s === existing ? { ...s, ladiesOnly: !s.ladiesOnly } : s)) });
    patchDeck({ ...deck, seats: deck.seats.map((s) => (s === existing ? { ...s, type: tool } : s)) });
  }

  function renumber() {
    const prefix = deck.deck === 1 ? 'L' : 'U';
    const ordered = [...deck.seats].sort((a, b) => a.position.row - b.position.row || a.position.col - b.position.col);
    const map = new Map(ordered.map((s, i) => [s, `${value.decks.length > 1 ? prefix : ''}${i + 1}`]));
    patchDeck({ ...deck, seats: deck.seats.map((s) => ({ ...s, label: map.get(s)! })) });
  }

  function resize(rows: number, columns: number, aislePosition: number) {
    patchDeck({ ...deck, rows, columns, aislePosition, seats: deck.seats.filter((s) => s.position.row < rows && s.position.col < columns) });
  }

  function addDeck() {
    if (value.decks.length >= 3) return;
    const n = value.decks.length + 1;
    onChange({ ...value, decks: [...value.decks, { deck: n, rows: deck.rows, columns: deck.columns, aislePosition: deck.aislePosition, seats: [] }] });
    setDeckIdx(value.decks.length);
  }
  function removeDeck() {
    if (value.decks.length <= 1) return;
    onChange({ ...value, decks: value.decks.filter((_, i) => i !== deckIdx).map((d, i) => ({ ...d, deck: i + 1, seats: d.seats.map((s) => ({ ...s, deck: i + 1 })) })) });
    setDeckIdx(0);
  }

  const num = (v: number, set: (n: number) => void, min: number, max: number) => (
    <input type="number" min={min} max={max} value={v} onChange={(e) => set(Math.min(max, Math.max(min, Number(e.target.value) || min)))} className="w-16 rounded-lg border border-ink/10 bg-ink/5 px-2 py-1 text-sm" />
  );
  const seatCount = value.decks.reduce((a, d) => a + d.seats.length, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="font-semibold">Bus type
          <select className="ml-2 rounded-lg border border-ink/10 bg-ink/5 px-2 py-1" value={value.busType} onChange={(e) => confirm('Reset the layout to the default for this bus type?') && regenerate(e.target.value as BusType)}>
            <option value="seater">Fully Seater</option><option value="sleeper">Fully Sleeper</option><option value="double-decker">Double-Decker</option><option value="hybrid">Hybrid</option>
          </select>
        </label>
        <span className="text-ink-soft">{value.decks.length} deck(s) · {seatCount} seats</span>
        <Button type="button" variant="ghost" className="px-3 py-1.5" onClick={addDeck}>+ Deck</Button>
        <Button type="button" variant="ghost" className="px-3 py-1.5" onClick={removeDeck}>− Deck</Button>
      </div>
      <div className="flex gap-2">{value.decks.map((d, i) => <button key={d.deck} type="button" onClick={() => setDeckIdx(i)} className={`rounded-full px-4 py-1.5 text-sm font-bold ${i === deckIdx ? 'bg-brand text-cream' : 'border border-ink/10 bg-ink/5 text-ink-soft'}`}>Deck {d.deck}</button>)}</div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>Rows {num(deck.rows, (n) => resize(n, deck.columns, deck.aislePosition), 1, 30)}</span>
        <span>Columns {num(deck.columns, (n) => resize(deck.rows, n, Math.min(deck.aislePosition, n)), 1, 8)}</span>
        <span>Aisle after col {num(deck.aislePosition, (n) => resize(deck.rows, deck.columns, n), 0, deck.columns)}</span>
        <Button type="button" variant="ghost" className="px-3 py-1.5" onClick={renumber}>Auto-number deck</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {([['seater', 'Seater'], ['sleeper', 'Sleeper'], ['ladies', 'Toggle ladies-only'], ['rename', 'Rename'], ['erase', 'Erase']] as [Tool, string][]).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTool(k)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${tool === k ? 'bg-brand text-white' : 'bg-ink/10 text-ink-soft'}`}>{l}</button>
        ))}
      </div>
      <div className="w-fit overflow-auto rounded-2xl border border-ink/10 bg-ink/5 p-3">
        {Array.from({ length: deck.rows }, (_, r) => (
          <div key={r} className="mb-1.5 flex gap-1.5">
            {Array.from({ length: deck.columns }, (_, c) => {
              const s = deck.seats.find((x) => x.position.row === r && x.position.col === c);
              return (
                <div key={c} className={c === deck.aislePosition && c > 0 ? 'ml-5' : ''}>
                  {s ? <SeatBox label={s.label} sleeper={s.type === 'sleeper'} visual={s.ladiesOnly ? 'ladies' : 'available'} onClick={() => clickCell(r, c)} /> : <button type="button" aria-label={`Add seat at row ${r + 1} col ${c + 1}`} onClick={() => clickCell(r, c)} className="h-[54px] w-12 rounded-xl border-2 border-dashed border-ink/20 text-ink/30 hover:bg-brand-50 ">+</button>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-soft">Pick a tool, then click cells. Adjacent pairs (same row, same side of the aisle) drive the gender rules.</p>
    </div>
  );
}
