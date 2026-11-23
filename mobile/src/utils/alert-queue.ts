import { type AlertButton } from 'react-native';

/** Alerts waiting to be shown on web, oldest first. Phones use the system alert instead. */
export type QueuedAlert = { title: string; message?: string; buttons: AlertButton[] };

let queue: readonly QueuedAlert[] = [];
const listeners = new Set<() => void>();

function set(next: readonly QueuedAlert[]) {
  queue = next;
  listeners.forEach((listener) => listener());
}

export function pushAlert(alert: QueuedAlert) {
  set([...queue, alert]);
}

export function removeAlert(alert: QueuedAlert) {
  set(queue.filter((item) => item !== alert));
}

export function currentAlert(): QueuedAlert | null {
  return queue[0] ?? null;
}

export function subscribeToAlerts(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
