import { useState } from 'react';

import type { SavedPlace, Tag, Visibility } from '@/api/types';

export type SavedSort = 'saved' | 'visited' | 'name';
export type VisitedFilter = 'all' | 'visited' | 'not_visited';

export type SavedFilters = {
  q: string;
  sort: SavedSort;
  visited: VisitedFilter;
  visibility: Visibility | 'any';
  price: string | 'any';
  type: string | 'any';
  /** A tag id (as a string, so it works with the chip pickers), or 'any'. */
  tag: string | 'any';
};

export const DEFAULT_FILTERS: SavedFilters = {
  q: '',
  sort: 'saved',
  visited: 'all',
  visibility: 'any',
  price: 'any',
  type: 'any',
  tag: 'any',
};

/** Google types that are on nearly everything, so they're no use as a filter. */
const GENERIC_TYPES = new Set(['point_of_interest', 'establishment', 'food', 'store']);
const MAX_TYPES = 8;

/** Filter state for the Saved tab, plus how many filters (not search or sort) are on. */
export function useSavedFilters() {
  const [filters, setFilters] = useState<SavedFilters>(DEFAULT_FILTERS);
  const activeCount = (['visited', 'visibility', 'price', 'type', 'tag'] as const).filter(
    (key) => filters[key] !== DEFAULT_FILTERS[key],
  ).length;

  return {
    filters,
    set: <K extends keyof SavedFilters>(key: K, value: SavedFilters[K]) =>
      setFilters((prev) => ({ ...prev, [key]: value })),
    clear: () => setFilters((prev) => ({ ...DEFAULT_FILTERS, sort: prev.sort })),
    activeCount,
  };
}

/**
 * Applies the filters and sort on the device. Saved lists are small, so this is instant and
 * avoids a round trip (and a spinner) on every tap. Same rules as the API's ?q=&visited=&sort=.
 */
export function applySavedFilters(items: SavedPlace[], f: SavedFilters): SavedPlace[] {
  const q = f.q.trim().toLowerCase();
  const filtered = items.filter(
    (item) =>
      (!q || item.place.name.toLowerCase().includes(q)) &&
      (f.visited === 'all' || item.visited === (f.visited === 'visited')) &&
      (f.visibility === 'any' || item.visibility === f.visibility) &&
      (f.price === 'any' || item.place.price_range === f.price) &&
      (f.type === 'any' || item.place.types.includes(f.type)) &&
      (f.tag === 'any' || item.tags.some((tag) => String(tag.id) === f.tag)),
  );

  const byNewestSave = (a: SavedPlace, b: SavedPlace) => b.created_at.localeCompare(a.created_at);
  return filtered.sort((a, b) => {
    if (f.sort === 'name') return a.place.name.localeCompare(b.place.name);
    if (f.sort === 'visited') {
      // Latest visit first, unvisited last.
      if (a.visited_at && b.visited_at) return b.visited_at.localeCompare(a.visited_at);
      if (a.visited_at || b.visited_at) return a.visited_at ? -1 : 1;
    }
    return byNewestSave(a, b);
  });
}

/** My tags that are on at least one place in the list, A to Z. */
export function tagOptions(items: SavedPlace[]): Tag[] {
  const tags = new Map<number, Tag>();
  for (const item of items) for (const tag of item.tags) tags.set(tag.id, tag);
  return [...tags.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Price ranges that appear in the list, cheapest first. */
export function priceOptions(items: SavedPlace[]): string[] {
  const prices = new Set(items.map((item) => item.place.price_range).filter((p) => p !== null));
  return [...prices].sort((a, b) => a.length - b.length);
}

/** The most common place types in the list (e.g. restaurant, museum, park). */
export function typeOptions(items: SavedPlace[]): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const type of item.place.types) {
      if (!GENERIC_TYPES.has(type)) counts.set(type, (counts.get(type) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_TYPES)
    .map(([type]) => type);
}

/** "tourist_attraction" → "Tourist attraction" */
export function typeLabel(type: string) {
  const words = type.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
