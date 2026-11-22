import * as Location from 'expo-location';
import { useEffect, useRef, type RefObject } from 'react';

/**
 * Watches the compass while `enabled` (needs location permission). The ref holds the latest
 * true-north heading in degrees, or undefined when there isn't one (simulators have no
 * compass, and iOS reports -1 without location permission). Leave `heading` out of the
 * request when it's undefined; the API falls back to distance only.
 *
 * It's a ref, not state, because the compass fires many times a second and nothing on screen
 * shows it. Read `.current` in event handlers (like the shutter), not during render.
 */
export function useHeading(enabled: boolean): RefObject<number | undefined> {
  const heading = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    Location.watchHeadingAsync(
      ({ trueHeading }) => {
        heading.current = trueHeading >= 0 ? trueHeading : undefined;
      },
      () => {
        heading.current = undefined;
      },
    )
      .then((sub) => {
        if (cancelled) sub.remove();
        else subscription = sub;
      })
      // No compass on this device.
      .catch(() => {});

    return () => {
      cancelled = true;
      subscription?.remove();
      heading.current = undefined;
    };
  }, [enabled]);

  return heading;
}
