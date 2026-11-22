import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import type { Coords } from '@/api/places';

export type LocationPermission = 'loading' | 'granted' | 'denied' | 'undetermined';

export type LocationState = {
  /** Latest position, or null until the first fix (or if permission isn't granted). */
  coords: Coords | null;
  permission: LocationPermission;
  /** False once the user has said no for good; only Settings can turn it back on. */
  canAskAgain: boolean;
  /** Shows the system permission prompt. Resolves to true if granted. */
  requestPermission: () => Promise<boolean>;
};

type Options = {
  /** 'high' for scan (the API's bearing math needs a precise fix), 'balanced' otherwise. */
  accuracy?: 'high' | 'balanced';
};

/**
 * Watches the user's position while the calling screen is mounted. Never prompts on its
 * own: call `requestPermission` when the screen should ask (scan does; search doesn't).
 */
export function useLocation({ accuracy = 'balanced' }: Options = {}): LocationState {
  const [status, requestPermission] = Location.useForegroundPermissions();
  const [coords, setCoords] = useState<Coords | null>(null);
  const granted = status?.granted ?? false;

  useEffect(() => {
    if (!granted) return;
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    const high = accuracy === 'high';
    Location.watchPositionAsync(
      {
        accuracy: high ? Location.Accuracy.High : Location.Accuracy.Balanced,
        distanceInterval: high ? 5 : 50,
      },
      (location) => setCoords({ lat: location.coords.latitude, lng: location.coords.longitude }),
      // Location services off or no fix yet: keep the last coords (or null) and carry on.
      () => {},
    )
      .then((sub) => {
        if (cancelled) sub.remove();
        else subscription = sub;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [granted, accuracy]);

  let permission: LocationPermission = 'loading';
  if (status) permission = status.granted ? 'granted' : status.status === 'denied' ? 'denied' : 'undetermined';

  return {
    coords: granted ? coords : null,
    permission,
    canAskAgain: status?.canAskAgain ?? true,
    requestPermission: async () => (await requestPermission()).granted,
  };
}
