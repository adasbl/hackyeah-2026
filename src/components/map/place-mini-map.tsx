'use client';

/**
 * Mini-mapa na stronie obiektu: jedna duża pinezka, bez pobierania innych obiektów.
 * Przewijanie strony nad mapą nie przybliża jej (kooperacyjne gesty), żeby nie „łapała” scrolla.
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import * as maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import type { CategorySlug, GeoPoint } from '@repo/types';
import { createPin, MAP_STYLE_URL } from './markers';

interface Props {
  name: string;
  category: CategorySlug;
  location: GeoPoint;
}

export function PlaceMiniMap({ name, category, location }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [location.lng, location.lat],
      zoom: 15,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      cooperativeGestures: true,
      locale: {
        'CooperativeGesturesHandler.MobileHelpText': 'Przesuń mapę dwoma palcami',
        'CooperativeGesturesHandler.WindowsHelpText': 'Użyj Ctrl + kółko myszy, aby przybliżyć mapę',
        'CooperativeGesturesHandler.MacHelpText': 'Użyj ⌘ + kółko myszy, aby przybliżyć mapę',
      },
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const el = createPin({ name, category }, { size: 'lg', label: name });
    el.style.cursor = 'default';
    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([location.lng, location.lat]).addTo(map);
    return () => {
      marker.remove();
      map.remove();
    };
  }, [name, category, location.lat, location.lng]);

  return <div ref={containerRef} className="h-full w-full" aria-label={`Mapa: położenie obiektu ${name}`} role="region" />;
}
