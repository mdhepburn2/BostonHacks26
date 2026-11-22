import { useEffect, useRef, useState } from 'react';

import { ApiError } from '@/api/client';

const DEBOUNCE_MS = 400;

type Fetched<T> = {
  /** The query these results (or this error) belong to. */
  q: string;
  results: T[];
  error: ApiError | null;
  loading: boolean;
};

export type DebouncedSearch<T> = {
  /** Trimmed query is too short to search; show a hint instead of results. */
  idle: boolean;
  /** A search is waiting on the debounce or the network. Earlier results stay in `results`. */
  loading: boolean;
  results: T[];
  error: ApiError | null;
  /** The query `results` came from, for "No results for …". */
  resultsFor: string;
  retry: () => void;
};

/**
 * Searches as the user types. Waits until typing pauses, skips queries shorter than
 * `minLength`, and ignores responses for queries the user has already typed past.
 */
export function useDebouncedSearch<T>(
  query: string,
  minLength: number,
  search: (q: string) => Promise<T[]>,
): DebouncedSearch<T> {
  const q = query.trim();
  const [fetched, setFetched] = useState<Fetched<T>>({ q: '', results: [], error: null, loading: false });
  const [attempt, setAttempt] = useState(0);
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  });

  useEffect(() => {
    if (q.length < minLength) return;
    let stale = false;

    const timer = setTimeout(() => {
      setFetched((prev) => ({ ...prev, loading: true, error: null }));
      searchRef
        .current(q)
        .then((results) => {
          if (!stale) setFetched({ q, results, error: null, loading: false });
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
  }, [q, minLength, attempt]);

  const idle = q.length < minLength;
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
