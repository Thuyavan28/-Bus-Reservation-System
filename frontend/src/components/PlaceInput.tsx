import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LuCheck, LuMapPin, LuX } from 'react-icons/lu';
import { catalogApi, errorMessage, type Place } from '../utils/api';
import i18n from '../i18n';
import { tp } from '../utils/format';
import { useTranslation } from 'react-i18next';

interface Props {
  label: string;
  /** what the user has typed / the chosen place name */
  text: string;
  onText: (t: string) => void;
  place: Place | null;
  onPlace: (p: Place | null) => void;
  placeholder?: string;
  icon?: ReactNode;
  /** extra control on the right (e.g. use-my-location) */
  trailing?: ReactNode;
  className?: string;
}

/**
 * Typeable place card: suggestions as you type, any South-Indian town accepted (resolved on the server).
 * Arrow keys + Enter work; Enter or leaving the box with unmatched text asks the server to resolve it.
 */
export default function PlaceInput({ label, text, onText, place, onPlace, placeholder, icon, trailing, className = '' }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Place[]>([]);
  const [hi, setHi] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const box = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    clearTimeout(timer.current);
    const my = ++seq.current;
    timer.current = setTimeout(() => {
      catalogApi.suggest(text).then((r) => my === seq.current && (setItems(r), setHi(0))).catch(() => undefined);
    }, 120);
    return () => clearTimeout(timer.current);
  }, [text, open]);

  useEffect(() => {
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const choose = (p: Place) => { onText(p.name); onPlace(p); setErr(''); setOpen(false); };

  async function resolveTyped() {
    const t = text.trim();
    if (place || t.length < 2) return;
    setBusy(true);
    setErr('');
    try { choose(await catalogApi.resolve(t)); } catch (e: any) { setErr(e?.message ? errorMessage(e) : i18n.t('Could not find that place')); } finally { setBusy(false); }
  }

  return (
    <div ref={box} className="relative w-full">
      <div className={`flex items-center gap-2.5 rounded-2xl transition focus-within:ring-2 focus-within:ring-brand/20 ${className || (err ? 'border-2 border-brand bg-card px-3.5 py-2.5' : 'border-2 border-ink/15 bg-card px-3.5 py-2.5')}`}>
        {icon && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-tint">{icon}</span>}
        <label className="min-w-0 flex-1">
          {label && <span className="block text-[11px] font-semibold text-ink-soft">{label}</span>}
          <input
            value={text}
            placeholder={placeholder}
            autoComplete="off"
            aria-autocomplete="list"
            role="combobox"
            aria-expanded={open}
            maxLength={60}
            onFocus={() => setOpen(true)}
            onChange={(e) => { onText(e.target.value); if (place) onPlace(null); setErr(''); setOpen(true); }}
            onBlur={() => setTimeout(() => void resolveTyped(), 150)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, items.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
              else if (e.key === 'Enter') { if (open && items[hi]) { e.preventDefault(); choose(items[hi]); } else void resolveTyped(); }
              else if (e.key === 'Escape') setOpen(false);
            }}
            className="w-full bg-transparent text-[15px] font-bold text-ink outline-none placeholder:font-medium placeholder:text-ink-soft/60"
          />
        </label>
        {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/20 border-t-brand" aria-label={t('Finding place')} />}
        {place && !busy && <LuCheck size={16} className="text-brand-700" aria-label={t('Place found')} />}
        {trailing}
        {text && <button type="button" aria-label={`${t('Clear')} ${label}`} onClick={() => { onText(''); onPlace(null); setErr(''); setOpen(true); }} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-soft transition hover:bg-ink/10 hover:text-ink"><LuX size={15} /></button>}
      </div>
      {err && <p role="alert" className="mt-1.5 px-2 text-xs font-semibold text-brand-700">{err}</p>}
      {place?.approximate && <p className="mt-1 px-2 text-[11px] text-amber-800">{t('Location found by AI — position is approximate.')}</p>}
      {open && items.length > 0 && (
        <ul role="listbox" className="absolute z-40 mt-1.5 max-h-60 w-full animate-pop overflow-auto rounded-2xl border-2 border-ink bg-card p-1.5 shadow-lift">
          {items.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === hi}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(p)} onMouseEnter={() => setHi(i)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${i === hi ? 'bg-surface-tint' : ''}`}>
                <LuMapPin size={16} className="text-ink-soft" /><span className="flex-1 font-bold">{tp(p.name)}</span><span className="text-xs text-ink-soft">{tp(p.state)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
