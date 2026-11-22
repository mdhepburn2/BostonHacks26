import type { Circle } from '@/api/types';

/**
 * Expo Router can't return a value from a screen, so the "New circle" sheet announces the
 * circle it made here. The sharing picker listens while it's waiting for one, so creating a
 * circle from a place card shares the place with it straight away.
 */
type Listener = (circle: Circle) => void;

const listeners = new Set<Listener>();

export function onCircleCreated(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function announceCircleCreated(circle: Circle) {
  listeners.forEach((listener) => listener(circle));
}
