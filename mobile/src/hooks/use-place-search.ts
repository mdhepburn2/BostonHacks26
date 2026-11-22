import { useEffect, useState } from 'react';

import { ApiError } from '@/api/client';
import { searchPlaces } from '@/api/places';
import type { SearchResult } from '@/api/types';

const DEBOUNCE_MS = 400;
export const MIN_QUERY_LENGTH = 2;

type Fetched = {
  /** The query these results (or this error) belong to. */
  q: string;
  results: SearchResult[];
  error: ApiError | null;
  loading: boolean;
};

export type PlaceSearch = {
  /** Trimmed query is too short to search; show a hint instead of results. */
  idle: boolean;
  /** A search is waiting on the debounce or the network. Earlier results stay in `results`. */
  loading: boolean;
  results: SearchResult[];
  error: ApiError | null;
  /** The query `results` came from, for "No places match …". */
  resultsFor: string;
  retry: () => void;
};

/**
 * Searches places by name as the user types. Waits until typing pauses, skips very short
 * queries, and ignores responses for queries the user has already typed past.
 */
export function usePlaceSearch(query: string): PlaceSearch {
  const q = query.trim();
  const [fetched, setFetched] = useState<Fetched>({ q: '', results: [], error: null, loading: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (q.length < MIN_QUERY_LENGTH) return;
    let stale = false;

    const timer = setTimeout(() => {
      setFetched((prev) => ({ ...prev, loading: true, error: null }));
      // TODO(step 6): pass the user's lat/lng here once the location hook exists, so nearby
      // places rank higher. Leave both out if permission wasn't granted.
      searchPlaces(q)
        .then((res) => {
          if (!stale) setFetched({ q, results: res.results, error: null, loading: false });
        })
        .catch((err: unknown) => {
          if (stale) return;
          const error =
            err instanceof ApiError
              ? err
              : new ApiError('unavailable', 'Something went wrong. Please try again.', null);
          setFetched({ q, results: [], error, loading: false });
        });
    }, DEBOUNCE_MS);

    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [q, attempt]);

  const idle = q.length < MIN_QUERY_LENGTH;
  const upToDate = fetched.q === q;

  return {
    idle,
    loading: !idle && (fetched.loading || !upToDate),
    results: idle ? [] : fetched.results,
    // An error only counts for the query it came from.
    error: !idle && upToDate ? fetched.error : null,
    resultsFor: fetched.q,
    retry: () => {
      // Show the spinner straight away instead of the old error during the debounce.
      setFetched((prev) => ({ ...prev, loading: true, error: null }));
      setAttempt((n) => n + 1);
    },
  };
}
