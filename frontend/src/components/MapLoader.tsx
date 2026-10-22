import { useEffect, useRef } from 'react';

/**
 * Animated map loader shown while Leaflet tiles are being fetched.
 * Features:
 *  - Animated grid of "map tiles" fading in like real tiles load
 *  - Moving red bus icon travelling along a dashed route
 *  - Pulsing location pins at origin & destination
 *  - Shimmer wave across the whole surface
 */
export default function MapLoader({ className = 'h-56' }: { className?: string }) {
  const busRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const bus = busRef.current;
    if (!bus) return;
    let pos = 0;
    const id = setInterval(() => {
      pos = (pos + 0.4) % 100;
      bus.style.offsetDistance = `${pos}%`;
    }, 16);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className={`${className} relative z-0 overflow-hidden rounded-3xl bg-[#1a1a2e]`}
      role="img"
      aria-label="Map loading…"
    >
      {/* ── tile grid shimmer ── */}
      <div className="absolute inset-0 grid grid-cols-4 grid-rows-3 gap-[1px] opacity-30">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="map-tile-cell"
            style={{ animationDelay: `${(i * 120) % 900}ms` }}
          />
        ))}
      </div>

      {/* ── road grid lines ── */}
      <svg className="absolute inset-0 h-full w-full opacity-20" xmlns="http://www.w3.org/2000/svg">
        {/* horizontal roads */}
        {[20, 45, 70].map((y) => (
          <line key={`h${y}`} x1="0" y1={`${y}%`} x2="100%" y2={`${y}%`}
            stroke="#ffffff" strokeWidth="1.5" strokeDasharray="8 12" />
        ))}
        {/* vertical roads */}
        {[15, 40, 65, 88].map((x) => (
          <line key={`v${x}`} x1={`${x}%`} y1="0" x2={`${x}%`} y2="100%"
            stroke="#ffffff" strokeWidth="1.5" strokeDasharray="8 12" />
        ))}

        {/* ── curved route path ── */}
        <path
          id="bus-path"
          d="M 8% 80% C 25% 80%, 35% 30%, 55% 25% S 80% 40% 92% 20%"
          fill="none"
          stroke="#FF1840"
          strokeWidth="3"
          strokeDasharray="10 6"
          strokeLinecap="round"
          opacity="0.9"
        />
        {/* white underline for the route */}
        <path
          d="M 8% 80% C 25% 80%, 35% 30%, 55% 25% S 80% 40% 92% 20%"
          fill="none"
          stroke="#ffffff"
          strokeWidth="6"
          strokeDasharray="10 6"
          strokeLinecap="round"
          opacity="0.25"
        />
      </svg>

      {/* ── animated bus along the route ── */}
      <div className="bus-traveller absolute" aria-hidden="true">
        <div className="bus-dot">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="4" width="20" height="14" rx="3" fill="white"/>
            <rect x="4" y="7" width="6" height="4" rx="1" fill="#FF1840"/>
            <rect x="14" y="7" width="6" height="4" rx="1" fill="#FF1840"/>
            <circle cx="7" cy="19" r="2" fill="#222"/>
            <circle cx="17" cy="19" r="2" fill="#222"/>
          </svg>
        </div>
      </div>

      {/* ── origin pin (pulsing) ── */}
      <div className="absolute" style={{ left: '8%', top: '80%', transform: 'translate(-50%, -100%)' }}>
        <div className="pin-pulse">
          <div className="pin-core bg-white" />
        </div>
        <div className="mt-1 rounded-full bg-black/70 px-2 py-0.5 text-center text-[9px] font-black text-white whitespace-nowrap">
          FROM
        </div>
      </div>

      {/* ── destination pin (pulsing, delayed) ── */}
      <div className="absolute" style={{ left: '92%', top: '20%', transform: 'translate(-50%, -100%)' }}>
        <div className="pin-pulse" style={{ animationDelay: '0.4s' }}>
          <div className="pin-core bg-[#FF1840]" />
        </div>
        <div className="mt-1 rounded-full bg-black/70 px-2 py-0.5 text-center text-[9px] font-black text-white whitespace-nowrap">
          TO
        </div>
      </div>

      {/* ── city dots scattered ── */}
      {[
        { x: 30, y: 55 }, { x: 55, y: 25 }, { x: 70, y: 60 }, { x: 45, y: 78 }
      ].map(({ x, y }, i) => (
        <div
          key={i}
          className="city-dot"
          style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 300}ms` }}
        />
      ))}

      {/* ── shimmer overlay ── */}
      <div className="shimmer-wave absolute inset-0 pointer-events-none" />

      {/* ── loading label ── */}
      <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-2">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#FF1840]" style={{ animationDelay: '0ms' }} />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#FF1840]" style={{ animationDelay: '150ms' }} />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#FF1840]" style={{ animationDelay: '300ms' }} />
        <span className="ml-1 text-[11px] font-black tracking-widest text-white/70 uppercase">Loading Map</span>
      </div>
    </div>
  );
}
