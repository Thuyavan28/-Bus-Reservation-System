import { lazy, Suspense, type ComponentProps } from 'react';

const MapView = lazy(() => import('./MapView'));
export type { MapMarker } from './MapView';

/** Leaflet is loaded on demand; a flat placeholder holds the space meanwhile. */
export default function MapLazy(props: ComponentProps<typeof MapView>) {
  return (
    <Suspense fallback={<div className={`${props.className ?? 'h-56'} relative z-0 overflow-hidden rounded-3xl bg-surface-tint`}><div className="skeleton absolute inset-0 !rounded-none" /></div>}>
      <MapView {...props} />
    </Suspense>
  );
}
