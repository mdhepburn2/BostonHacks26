/** Dates the API sends as "YYYY-MM-DD" are calendar days, so read and write them as local dates. */

/** A local calendar date as "YYYY-MM-DD" (not toISOString, which is UTC and can be a day off). */
export function toIsoDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromIsoDate(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** "Aug 26, 2026" */
export function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Sat, Nov 22 · 7:00 PM" for an activity's start time (adds the year if it isn't this year). */
export function formatWhen(iso: string) {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const day = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  return `${day} · ${formatTime(date)}`;
}

/** "7:00 PM" */
export function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function isPast(iso: string) {
  return new Date(iso).getTime() < Date.now();
}
