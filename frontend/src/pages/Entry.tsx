import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuBus, LuMapPin } from 'react-icons/lu';
import { useAuth } from '../store/auth';

export const HERO = '/hero.svg';
const HERO_GREEN = '/hero-green.svg';
const MIN_MS = 1800;

const reduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Deterministic pseudo-random for particles (no Math.random on each render). */
function pseudoRand(seed: number) {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

const PARTICLES = Array.from({ length: 14 }, (_, i) => ({
  id: i,
  size: 3 + pseudoRand(i * 3) * 5,
  x: pseudoRand(i * 7) * 100,
  y: pseudoRand(i * 11) * 100,
  dur: 3 + pseudoRand(i * 13) * 5,
  delay: pseudoRand(i * 17) * 4,
  opacity: 0.15 + pseudoRand(i * 19) * 0.3,
}));

const STAGES = [
  'Checking real-time traffic…',
  'Mapping your route…',
  'Estimating arrival times…',
  'Getting your journey ready',
];

/** Full-screen loader with standard clean 2D layout. */
export default function Entry() {
  const nav = useNavigate();
  const init = useAuth((s) => s.init);
  const [pct, setPct] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);
  const [stageVisible, setStageVisible] = useState(true);
  const calm = useRef(reduced());

  /* Rotate stage text */
  useEffect(() => {
    const id = setInterval(() => {
      setStageVisible(false);
      setTimeout(() => {
        setStageIdx((s) => (s + 1) % STAGES.length);
        setStageVisible(true);
      }, 350);
    }, 1400);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const start = performance.now();
    const work = Promise.all([
      new Promise<void>((r) => {
        const i = new Image();
        i.onload = i.onerror = () => r();
        i.src = HERO_GREEN;
      }),
      (document as any).fonts?.ready ?? Promise.resolve(),
      init(),
    ]);
    let done = false;
    work.finally(() => (done = true));

    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / MIN_MS, 1);
      const eased = 1 - Math.pow(1 - t, 2);
      setPct(Math.round((t < 1 || done ? eased : Math.min(eased, 0.96)) * 100));
      if (t >= 1 && done) {
        if (cancelled) return;
        setPct(100);
        setLeaving(true);
        setTimeout(() => {
          const seen = (() => {
            try { return localStorage.getItem('busgo-welcomed'); } catch { return '1'; }
          })();
          nav(seen ? '/home' : '/welcome', { replace: true });
        }, calm.current ? 50 : 500);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [init, nav]);

  return (
    <div
      className={`fixed inset-0 overflow-hidden transition-opacity duration-500 ${leaving ? 'opacity-0' : 'opacity-100'}`}
      style={{ background: 'linear-gradient(160deg, #00897b 0%, #00695c 40%, #004d40 100%)' }}
      aria-busy={!leaving}
    >
      {/* Background illustration overlay */}
      {!calm.current && (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-15"
          style={{
            backgroundImage: `url(${HERO_GREEN})`,
          }}
        />
      )}

      {/* Radial ambient glow */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(178,223,219,0.18) 0%, transparent 70%)' }} />

      {/* Floating particles */}
      {!calm.current && PARTICLES.map((p) => (
        <span
          key={p.id}
          className="pointer-events-none absolute rounded-full bg-white"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.x}%`,
            top: `${p.y}%`,
            opacity: p.opacity,
            animation: `floatDot ${p.dur}s ease-in-out ${p.delay}s infinite alternate`,
          }}
        />
      ))}

      {/* ── Main centered layout ── */}
      <div className="relative flex h-full flex-col items-center justify-between px-6 py-12 sm:py-16 text-white">

        {/* ─── TOP: Brand ─── */}
        <div
          className="flex flex-col items-center gap-3 text-center"
          style={calm.current ? {} : { animation: 'revealDown 0.8s cubic-bezier(0.22,1,0.36,1) both' }}
        >
          <h1
            className="text-5xl sm:text-6xl font-extrabold tracking-tight"
            style={{ textShadow: '0 2px 20px rgba(0,0,0,0.35)' }}
          >
            BusGo <span style={{ color: '#b2dfdb' }}>South</span>
          </h1>
          <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>
            Tamil Nadu · Bengaluru · Kerala
          </p>
        </div>

        {/* ─── BOTTOM: Clean 2D Progress block ─── */}
        <div
          className="w-full max-w-sm"
          style={calm.current ? {} : { animation: 'revealUp 0.8s cubic-bezier(0.22,1,0.36,1) 0.15s both' }}
        >
          {/* Animated road track with moving bus marker */}
          <div className="relative h-14 w-full">
            {/* Road base line */}
            <div
              className="absolute inset-x-0 top-1/2 -translate-y-1/2"
              style={{
                height: 4,
                borderRadius: 99,
                background: 'rgba(255,255,255,0.15)',
              }}
            />
            {/* Dashed line */}
            <svg className="absolute inset-x-0 top-1/2 -translate-y-1/2 w-full" height={4} aria-hidden>
              <line
                x1="0"
                y1="2"
                x2="100%"
                y2="2"
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="3"
                strokeDasharray="16 14"
                style={{ animation: calm.current ? 'none' : 'dashMove 0.7s linear infinite' }}
              />
            </svg>
            {/* Progress fill */}
            <div
              className="absolute top-1/2 left-0 -translate-y-1/2 rounded-full transition-all duration-100"
              style={{
                height: 4,
                width: `${pct}%`,
                background: 'linear-gradient(90deg, rgba(255,255,255,0.6) 0%, #fff 100%)',
                boxShadow: '0 0 8px rgba(255,255,255,0.8)',
              }}
            />
            {/* Destination pin */}
            <span
              className="absolute top-1/2 right-0 -translate-y-full translate-x-1 pb-1"
              style={{ color: 'rgba(255,255,255,0.7)' }}
            >
              <LuMapPin size={20} />
            </span>
            {/* 2D Bus marker */}
            <span
              className="absolute grid place-items-center rounded-xl border-2 border-white/60 text-white shadow-xl transition-[left] duration-100"
              style={{
                width: 42,
                height: 42,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                left: `${Math.max(pct, 4)}%`,
                background: 'rgba(0,77,64,0.92)',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 0 16px rgba(255,255,255,0.25)',
              }}
              aria-hidden
            >
              <LuBus size={20} />
            </span>
          </div>

          {/* Percentage */}
          <p
            className="mt-5 text-center tabular-nums font-extrabold"
            style={{
              fontSize: 'clamp(3rem, 12vw, 4.5rem)',
              lineHeight: 1,
              textShadow: '0 2px 24px rgba(0,0,0,0.4)',
            }}
            aria-live="polite"
          >
            {pct}%
          </p>

          {/* Stage label */}
          <p
            className="mt-3 text-center text-xs font-extrabold uppercase tracking-[0.2em] transition-opacity duration-300"
            style={{
              color: 'rgba(255,255,255,0.85)',
              opacity: stageVisible ? 1 : 0,
            }}
          >
            {STAGES[stageIdx]}
          </p>

          {/* Progress bar */}
          <div
            className="mt-4 overflow-hidden rounded-full"
            style={{ height: 5, background: 'rgba(255,255,255,0.15)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${pct}%`,
                background: 'linear-gradient(90deg, rgba(178,223,219,0.8) 0%, #fff 100%)',
                boxShadow: '0 0 10px rgba(255,255,255,0.7)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Clean 2D keyframes */}
      <style>{`
        @keyframes revealDown {
          from { opacity: 0; transform: translateY(-20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes revealUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes floatDot {
          from { transform: translateY(0); }
          to   { transform: translateY(-16px); }
        }
        @keyframes dashMove {
          from { stroke-dashoffset: 0; }
          to   { stroke-dashoffset: -30; }
        }
      `}</style>
    </div>
  );
}
