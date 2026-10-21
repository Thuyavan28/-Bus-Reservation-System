import { useEffect, useMemo, useRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import L from 'leaflet';
import i18n from '../i18n';
import 'leaflet/dist/leaflet.css';
import { LuBus, LuFlag, LuLocateFixed, LuMapPin, LuNavigation } from 'react-icons/lu';
import { decodePolyline } from '../utils/format';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  kind?: 'user' | 'boarding' | 'dropping' | 'city' | 'bus' | 'landmark';
  title?: string;
}

/** Real map tiles. Defaults to Esri World Imagery (satellite); override with VITE_MAP_TILES. */
export const TILE_URL = (import.meta.env.VITE_MAP_TILES as string | undefined) || 'https://{s}.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const TILE_ATTR = (import.meta.env.VITE_MAP_ATTRIBUTION as string | undefined) || 'Esri, Maxar, Earthstar Geographics';
// updateWhenIdle + small buffer: fewer tile requests while panning/zooming; no retina doubling
export const makeTiles = () => L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 18, subdomains: ['server', 'services'], keepBuffer: 1, updateWhenIdle: true, detectRetina: false });

const COLORS: Record<string, string> = { user: '#111111', boarding: '#111111', dropping: '#FF1840', city: '#ffffff', bus: '#FF1840', landmark: '#111111' };
const ICONS = { user: LuLocateFixed, boarding: LuMapPin, dropping: LuFlag, bus: LuBus, landmark: LuNavigation } as const;

export function pinIcon(m: MapMarker, selected: boolean, showLabel: boolean) {
  const kind = m.kind ?? 'city';
  const color = COLORS[kind];
  const label = showLabel ? (m.title ?? m.label ?? '').split(' – ')[0].split(' · ')[0] : '';
  if (kind === 'bus') return L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="vehicle">${renderToStaticMarkup(<LuBus size={18} />)}</div>` });
  if (kind === 'city') {
    return L.divIcon({ className: '', iconSize: [0, 0], html: `<div style="transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center"><span style="width:${selected ? 12 : 8}px;height:${selected ? 12 : 8}px;border-radius:50%;background:${color};border:2px solid #FF1840;box-shadow:0 0 0 3px rgba(255,24,64,.3)"></span>${label ? `<span style="margin-top:3px;font-size:10px;font-weight:800;color:#fff;text-shadow:0 1px 3px #000">${label}</span>` : ''}</div>` });
  }
  const Icon = ICONS[kind as keyof typeof ICONS] ?? LuMapPin;
  return L.divIcon({
    className: '', iconSize: [0, 0],
    html: `<div class="pin">${label ? `<span class="pin-label">${label}</span>` : ''}<span class="pin-dot" style="background:${color};${selected ? 'transform:scale(1.25)' : ''}">${renderToStaticMarkup(<Icon size={14} />)}</span></div>`,
  });
}

interface Props {
  markers?: MapMarker[];
  polyline?: string | { lat: number; lng: number }[] | null;
  className?: string;
  selectedId?: string | null;
  onMarkerClick?: (id: string) => void;
  /** dashed straight link between the first two markers when there is no route polyline */
  connect?: boolean;
  /** false = decorative background (no dragging / zooming) */
  interactive?: boolean;
  padding?: [number, number];
}

const SOUTH_INDIA: L.LatLngBoundsExpression = [[8, 74.5], [14.5, 80.8]];

/** Real satellite map with labelled pins and the road route drawn on top. */
export default function MapView({ markers = [], polyline, className = 'h-56', selectedId, onMarkerClick, connect, interactive = true, padding = [36, 36] }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const path = useMemo(() => (typeof polyline === 'string' ? (polyline ? decodePolyline(polyline) : []) : (polyline ?? [])), [polyline]);
  const click = useRef(onMarkerClick);
  click.current = onMarkerClick;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, dragging: interactive, scrollWheelZoom: interactive, doubleClickZoom: interactive, touchZoom: interactive, boxZoom: false, keyboard: interactive, zoomSnap: 0.25, fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false });
    makeTiles().addTo(m);
    m.attributionControl.setPrefix(false);
    m.fitBounds(SOUTH_INDIA);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, [interactive]);

  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const pts: L.LatLngExpression[] = [];
    const many = markers.length > 6;
    if (path.length > 1) {
      const step = Math.max(1, Math.floor(path.length / 500));
      const ll = path.filter((_, i) => i % step === 0 || i === path.length - 1).map((p) => [p.lat, p.lng] as L.LatLngTuple);
      L.polyline(ll, { color: '#ffffff', weight: 10, opacity: 0.95 }).addTo(g);
      L.polyline(ll, { color: '#FF1840', weight: 5, opacity: 1 }).addTo(g);
      pts.push(...ll);
    } else if (connect && markers.length >= 2) {
      L.polyline([[markers[0].lat, markers[0].lng], [markers[1].lat, markers[1].lng]], { color: '#ffffff', weight: 4, dashArray: '6 8' }).addTo(g);
    }
    for (const mk of markers) {
      const sel = mk.id === selectedId;
      if (mk.kind === 'city' && many) {
        // dozens of cities: cheap canvas dots instead of DOM markers
        L.circleMarker([mk.lat, mk.lng], { radius: 4, color: '#FF1840', weight: 2, fillColor: '#ffffff', fillOpacity: 1, interactive: false }).addTo(g);
        pts.push([mk.lat, mk.lng]);
        continue;
      }
      const showLabel = !many || mk.kind !== 'city' ? true : false;
      const marker = L.marker([mk.lat, mk.lng], { icon: pinIcon(mk, sel, showLabel), keyboard: false, interactive: !!onMarkerClick || !!mk.title, title: mk.title ?? mk.label, zIndexOffset: sel ? 1000 : mk.kind === 'bus' ? 900 : 0 });
      if (onMarkerClick) marker.on('click', () => click.current?.(mk.id));
      marker.addTo(g);
      pts.push([mk.lat, mk.lng]);
    }
    if (pts.length > 0) {
      if (pts.length === 1) m.setView(pts[0] as L.LatLngTuple, 13, { animate: false });
      else m.fitBounds(L.latLngBounds(pts), { padding, animate: false });
    }
  }, [markers, path, selectedId, connect, onMarkerClick, padding]);

  return <div ref={el} className={`${className} relative z-0 overflow-hidden rounded-3xl bg-surface-tint`} role="img" aria-label={i18n.t('Map')} />;
}
