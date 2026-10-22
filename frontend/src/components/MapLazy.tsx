import { lazy, Suspense, type ComponentProps } from 'react';
import MapLoader from './MapLoader';

const MapView = lazy(() => import('./MapView'));
export type { MapMarker } from './MapView';

/** Leaflet is loaded on demand; an animated map loader holds the space meanwhile. */
export default function MapLazy(props: ComponentProps<typeof MapView>) {
  return (
    <Suspense fallback={<MapLoader className={props.className ?? 'h-56'} />}>
      <MapView {...props} />
    </Suspense>
  );
}

