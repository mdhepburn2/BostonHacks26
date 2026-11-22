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
