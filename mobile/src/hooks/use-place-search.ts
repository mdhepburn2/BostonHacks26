import { useEffect, useRef } from 'react';

import { searchPlaces, type Coords } from '@/api/places';
import type { SearchResult } from '@/api/types';
import { useDebouncedSearch, type DebouncedSearch } from '@/hooks/use-debounced-search';

export const MIN_QUERY_LENGTH = 2;

export type PlaceSearch = DebouncedSearch<SearchResult>;

/**
 * Searches places by name as the user types. Pass `coords` (null if location isn't allowed)
 * to rank nearby places higher. A new position doesn't trigger a new search; the next one
 * just uses it.
 */
export function usePlaceSearch(query: string, coords: Coords | null): PlaceSearch {
  const coordsRef = useRef(coords);
  useEffect(() => {
    coordsRef.current = coords;
  }, [coords]);

  return useDebouncedSearch(query, MIN_QUERY_LENGTH, async (q) => {
    const res = await searchPlaces(q, coordsRef.current ?? undefined);
    return res.results;
  });
}
