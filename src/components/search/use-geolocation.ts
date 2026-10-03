'use client';

import { useCallback, useState } from 'react';
import type { GeoPoint } from '@repo/types';

export type GeoState = 'idle' | 'locating' | 'denied' | 'unavailable';

export const GEO_ERROR_LABEL: Partial<Record<GeoState, string>> = {
  denied: 'Brak zgody na lokalizację – włącz ją w ustawieniach przeglądarki.',
  unavailable: 'Nie udało się ustalić Twojej lokalizacji.',
};

/** Jednorazowe pobranie lokalizacji na żądanie (po kliknięciu), z obsługą odmowy i braku API. */
export function useGeolocation() {
  const [state, setState] = useState<GeoState>('idle');

  const locate = useCallback(
    () =>
      new Promise<GeoPoint | null>((resolve) => {
        if (!('geolocation' in navigator)) {
          setState('unavailable');
          resolve(null);
          return;
        }
        setState('locating');
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            setState('idle');
            resolve({ lat: coords.latitude, lng: coords.longitude });
          },
          (err) => {
            setState(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
            resolve(null);
          },
          { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 },
        );
      }),
    [],
  );

  return { state, locate };
}
