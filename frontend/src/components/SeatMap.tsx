import { useState } from 'react';
import type { BusLayout, Gender, SeatDef } from '@busgo/shared';
import { LuCheck, LuCircleDot, LuClock, LuDoorOpen, LuHourglass, LuLock, LuUserRound } from 'react-icons/lu';
import type { SeatInfo } from '../utils/api';
import { useTranslation } from 'react-i18next';
export type { SeatInfo };

interface Props {
  layout: BusLayout;
  seats: Record<string, SeatInfo>;
  /** seatId -> gender of the passenger selecting it */
  selected: Record<string, Gender>;
  /** gender of the passenger currently choosing; null when unknown */
  activeGender: Gender | null;
  onToggle: (seat: SeatDef) => void;
  readOnly?: boolean;
}

export type SeatVisual = 'available' | 'booked' | 'waiting' | 'held' | 'selected' | 'ladies' | 'restricted' | 'unavailable';

export function seatVisual(info: SeatInfo | undefined, isSelected: boolean, gender: Gender | null): SeatVisual {
  if (isSelected) return 'selected';
  if (!info) return 'unavailable';
  if (info.state === 'booked') return 'booked';
  if (info.state === 'held') return 'held';
  if (info.state === 'unavailable') return 'unavailable';
  // restricted seats look unavailable to passengers who may not take them
  if (gender && !info.allowedGenders.includes(gender)) return 'restricted';
  if (info.state === 'waiting') return 'waiting';
  if (info.ladiesOnly) return 'ladies';
  return 'available';
}

export const SELECTABLE: SeatVisual[] = ['available', 'ladies', 'waiting', 'selected'];

const isDark = () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

/** Flat palette: auto-inverts for light/dark mode. */
function makePalette(): Record<SeatVisual, { fill: string; stroke: string; text: string; accent: string; dash?: string }> {
  const dark = isDark();
  const bg   = dark ? '#1a1a1a' : '#ffffff';
  const ink  = dark ? '#f0f0f0' : '#111111';
  return {
    available:   { fill: bg,        stroke: ink,      text: ink,      accent: dark ? '#2e2e2e' : '#e0e0e0' },
    selected:    { fill: '#FF1840', stroke: '#FF1840', text: '#ffffff', accent: '#D00F31' },
    booked:      { fill: ink,       stroke: ink,       text: bg,       accent: dark ? '#2e2e2e' : '#333333' },
    waiting:     { fill: bg,        stroke: '#DC2626', text: '#B91C1C', accent: '#FECACA', dash: '4 3' },
    held:        { fill: bg,        stroke: ink,       text: ink,      accent: dark ? '#3a3a1a' : '#FFE97A', dash: '4 3' },
    ladies:      { fill: '#FCE7F3', stroke: '#DB2777', text: '#9D174D', accent: '#F9A8D4' },
    restricted:  { fill: dark ? '#2a2a2a' : '#F2EEC2', stroke: dark ? '#555' : '#B9B38A', text: dark ? '#888' : '#B9B38A', accent: dark ? '#333' : '#E3DEA8', dash: '3 3' },
    unavailable: { fill: dark ? '#222'    : '#EDE9B8', stroke: dark ? '#444' : '#C9C49A', text: dark ? '#666' : '#C9C49A', accent: dark ? '#2a2a2a' : '#E1DCA6' },
  };
}


const VISUAL_LABEL: Record<SeatVisual, string> = { available: 'Empty', booked: 'Reserved', waiting: 'Cancelled, awaiting rebooking', selected: 'Your pick', ladies: 'Ladies', held: 'Being booked', restricted: 'Not for you', unavailable: 'Unavailable' };

export const LEGEND: { v: SeatVisual; label: string }[] = [
  { v: 'available', label: 'Empty' },
  { v: 'booked', label: 'Reserved' },
  { v: 'waiting', label: 'Cancelled, awaiting rebooking' },
  { v: 'selected', label: 'Your pick' },
  { v: 'ladies', label: 'Ladies' },
  { v: 'held', label: 'Being booked' },
  { v: 'restricted', label: 'Not for you' },
];

const BADGE: Partial<Record<SeatVisual, { Icon: typeof LuLock; cls: string }>> = {
  booked: { Icon: LuLock, cls: 'bg-surface-tint text-ink' },
  waiting: { Icon: LuHourglass, cls: 'bg-brand text-cream animate-pulse2' },
  held: { Icon: LuClock, cls: 'bg-ink text-cream' },
  ladies: { Icon: LuUserRound, cls: 'bg-brand text-cream' },
};

/**
 * Realistic seater (top view): headrest, backrest with centre seam, cushion and two armrests.
 * Sleeper: a full-length berth with pillow, folded blanket and side rails.
 */
export function SeatIcon({ visual, label, sleeper, size = 1 }: { visual: SeatVisual; label: string; sleeper?: boolean; size?: number }) {
  const c = makePalette()[visual];
  const dash = c.dash;
  return sleeper ? (
    <svg viewBox="0 0 48 92" width={48 * size} height={92 * size} aria-hidden>
      <rect x="3" y="3" width="42" height="86" rx="12" fill={c.fill} stroke={c.stroke} strokeWidth="2.6" strokeDasharray={dash} />
      <rect x="9" y="9" width="30" height="19" rx="9" fill={c.accent} stroke={c.stroke} strokeWidth="1.6" />
      <line x1="24" y1="13" x2="24" y2="24" stroke={c.stroke} strokeWidth="1" opacity=".35" />
      <rect x="9" y="56" width="30" height="27" rx="8" fill={c.accent} stroke={c.stroke} strokeWidth="1.6" />
      <line x1="9" y1="64" x2="39" y2="64" stroke={c.stroke} strokeWidth="1.4" opacity=".5" />
      <line x1="5.5" y1="32" x2="5.5" y2="52" stroke={c.stroke} strokeWidth="2" strokeLinecap="round" opacity=".5" />
      <line x1="42.5" y1="32" x2="42.5" y2="52" stroke={c.stroke} strokeWidth="2" strokeLinecap="round" opacity=".5" />
      <text x="24" y="46" textAnchor="middle" fontSize="12" fontWeight="800" fill={c.text}>{label}</text>
    </svg>
  ) : (
    <svg viewBox="0 0 48 54" width={48 * size} height={54 * size} aria-hidden>
      <rect x="2" y="20" width="8" height="28" rx="4" fill={c.accent} stroke={c.stroke} strokeWidth="2" strokeDasharray={dash} />
      <rect x="38" y="20" width="8" height="28" rx="4" fill={c.accent} stroke={c.stroke} strokeWidth="2" strokeDasharray={dash} />
      <rect x="9" y="30" width="30" height="22" rx="8" fill={c.fill} stroke={c.stroke} strokeWidth="2.4" strokeDasharray={dash} />
      <rect x="8" y="7" width="32" height="28" rx="11" fill={c.fill} stroke={c.stroke} strokeWidth="2.4" strokeDasharray={dash} />
      <rect x="16" y="1.5" width="16" height="9" rx="4.5" fill={c.accent} stroke={c.stroke} strokeWidth="1.8" />
      <path d="M24 12 V31" stroke={c.stroke} strokeWidth="1" opacity=".3" />
      <text x="24" y="26" textAnchor="middle" fontSize="11.5" fontWeight="800" fill={c.text}>{label}</text>
    </svg>
  );
}

/** Button wrapper used by the passenger map and the operator layout builder. */
export function SeatBox({ visual, label, sleeper, onClick, disabled, title }: { visual: SeatVisual; label: string; sleeper?: boolean; onClick?: () => void; disabled?: boolean; title?: string }) {
  const { t } = useTranslation();
  const badge = BADGE[visual];
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} aria-label={`${t('Seat')} ${label} ${t(VISUAL_LABEL[visual])}`} aria-pressed={visual === 'selected'}
      className={`relative rounded-xl transition duration-200 ${disabled ? 'cursor-not-allowed' : 'hover:-translate-y-1 active:scale-90'} ${visual === 'selected' ? 'animate-seatpop drop-shadow-[0_6px_0_rgba(43,11,18,.25)]' : ''}`}>
      <SeatIcon visual={visual} label={label} sleeper={sleeper} />
      {visual === 'selected' && <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full border-2 border-ink bg-surface-tint text-ink"><LuCheck size={11} strokeWidth={4} /></span>}
      {badge && <span className={`absolute -bottom-1 -right-1 grid h-[18px] w-[18px] place-items-center rounded-full border-2 border-ink ${badge.cls}`}><badge.Icon size={9} strokeWidth={3} /></span>}
    </button>
  );
}

export default function SeatMap({ layout, seats, selected, activeGender, onToggle, readOnly }: Props) {
  const { t } = useTranslation();
  const [deckIdx, setDeckIdx] = useState(0);
  const deck = layout.decks[deckIdx] ?? layout.decks[0];
  const byCell = new Map(deck.seats.map((s) => [`${s.position.row}:${s.position.col}`, s]));
  const sleeperDeck = deck.seats.some((s) => s.type === 'sleeper');
  const hasSleeper = layout.decks.some((d) => d.seats.some((s) => s.type === 'sleeper'));
  const hasSeater = layout.decks.some((d) => d.seats.some((s) => s.type === 'seater'));
  const nameFor = (i: number) => t(layout.decks.length === 1 ? 'Seats' : layout.decks[i].seats[0]?.type === 'sleeper' ? (i === 0 ? 'Lower berths' : 'Upper berths') : i === 0 ? 'Lower deck' : 'Upper deck');
  const count = (v: SeatVisual) => Object.entries(seats).filter(([id, s]) => deck.seats.some((d) => d.id === id) && seatVisual(s, !!selected[id], activeGender) === v).length;

  return (
    <div>
      {layout.decks.length > 1 && (
        <div className="mb-3 flex gap-1.5 rounded-full border-2 border-ink bg-card p-1" role="tablist">
          {layout.decks.map((d, i) => (
            <button key={d.deck} role="tab" aria-selected={i === deckIdx} onClick={() => setDeckIdx(i)} className={`flex-1 rounded-full px-3 py-2.5 text-sm font-extrabold transition ${i === deckIdx ? 'bg-brand text-cream' : 'text-ink-soft'}`}>{nameFor(i)}</button>
          ))}
        </div>
      )}

      {/* bus body */}
      <div className="mx-auto w-fit max-w-full overflow-x-auto rounded-[2.4rem] border-4 border-ink bg-card p-4 pb-5 shadow-card">
        <div className="mb-4 flex items-center justify-between gap-8 rounded-2xl border-2 border-ink/15 bg-surface-tint px-4 py-2 text-[11px] font-extrabold text-ink">
          <span className="flex items-center gap-1.5"><LuDoorOpen size={15} /> {t('Door')}</span>
          <span className="flex items-center gap-1.5">{t('Driver')} <LuCircleDot size={17} /></span>
        </div>
        <div className="space-y-3">
          {Array.from({ length: deck.rows }, (_, r) => (
            <div key={r} className="flex items-center justify-center gap-2">
              {Array.from({ length: deck.columns }, (_, c) => {
                const seat = byCell.get(`${r}:${c}`);
                const aisle = c === deck.aislePosition && c !== 0 ? <div key={`a${c}`} className="mx-1 h-full w-4 self-stretch border-x-2 border-dashed border-ink/10" aria-hidden /> : null;
                const visual = seat ? seatVisual(seats[seat.id], !!selected[seat.id], activeGender) : 'unavailable';
                const cell = seat ? (
                  <SeatBox key={seat.id} label={seat.label} sleeper={seat.type === 'sleeper'} visual={visual} disabled={readOnly || !SELECTABLE.includes(visual)} onClick={() => onToggle(seat)}
                    title={`${seat.label}${seat.window ? ` · ${t('window')}` : ''}${visual === 'waiting' ? ` · ${t('cancelled, awaiting rebooking')}` : ''}`} />
                ) : (
                  <div key={`e${r}-${c}`} style={{ width: 48, height: sleeperDeck ? 92 : 54 }} />
                );
                return [aisle, cell];
              })}
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl bg-surface-tint py-1.5 text-center text-[10px] font-extrabold uppercase tracking-widest text-ink-soft">{t('Rear')}</div>
      </div>

      <div className="mt-4 rounded-3xl border border-ink/10 bg-card p-4 shadow-card">
        <div className="mb-3 flex flex-wrap gap-x-6 gap-y-2 border-b border-ink/10 pb-3 text-xs font-extrabold">
          {hasSeater && <span className="flex items-center gap-2"><SeatIcon visual="available" label="" size={0.6} />{t('Seater')}</span>}
          {hasSleeper && <span className="flex items-center gap-2"><SeatIcon visual="available" label="" sleeper size={0.45} />{t('Sleeper berth')}</span>}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-[11px] font-bold text-ink-soft sm:grid-cols-3 lg:grid-cols-2">
          {LEGEND.map((l) => (
            <span key={l.v} className="flex items-center gap-2">
              <SeatIcon visual={l.v} label="" size={0.5} /> {t(l.label)}{count(l.v) > 0 && l.v !== 'selected' && l.v !== 'restricted' ? ` (${count(l.v)})` : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
