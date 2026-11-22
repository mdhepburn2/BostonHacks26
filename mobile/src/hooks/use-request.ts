import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '@/api/client';

export type RequestState<T> = {
  /** True until the first response for this key (and while retrying after an error). */
  loading: boolean;
  data: T | null;
  error: ApiError | null;
  /** Clears the error and loads again, showing the spinner. */
  retry: () => void;
  /** Loads again in the background, keeping the current data on screen (pull to refresh). */
  refresh: () => void;
  /** A background refresh is in flight. */
  refreshing: boolean;
};

type Fetched<T> = { key: string; data: T | null; error: ApiError | null };

/**
 * Runs `fetcher` whenever `key` changes and tracks loading / data / error. Pass a key that
 * changes whenever the request should run again (e.g. include the place id and the user id),
 * or null to skip the request (e.g. when logged out).
 */
export function useRequest<T>(key: string | null, fetcher: () => Promise<T>): RequestState<T> {
  const [fetched, setFetched] = useState<Fetched<T> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    if (key === null) return;
    let stale = false;
    fetcherRef
      .current()
      .then((data) => {
        if (!stale) setFetched({ key, data, error: null });
      })
      .catch((err: unknown) => {
        if (stale) return;
        const error =
          err instanceof ApiError
            ? err
            : new ApiError('unavailable', 'Something went wrong. Please try again.', null);
        // A failed background refresh keeps what's already on screen.
        setFetched((prev) =>
          prev?.key === key && prev.data !== null ? prev : { key, data: null, error },
        );
      })
      .finally(() => {
        if (!stale) setRefreshing(false);
      });
    return () => {
      stale = true;
    };
  }, [key, attempt]);

  // Anything fetched for a different key doesn't count.
  const current = key !== null && fetched?.key === key ? fetched : null;

  return {
    loading: key !== null && current === null,
    data: current?.data ?? null,
    error: current?.error ?? null,
    retry: () => {
      setFetched(null);
      setAttempt((n) => n + 1);
    },
    refresh: () => {
      if (key === null) return;
      setRefreshing(true);
      setAttempt((n) => n + 1);
    },
    refreshing: key !== null && refreshing,
  };
}

/**
 * Calls `refresh` each time the screen comes back into focus (not on the first visit, which
 * already loads). Tabs stay mounted, so without this they'd show what was there on first load.
 */
export function useRefreshOnFocus(refresh: () => void) {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });
  const firstFocus = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      refreshRef.current();
    }, []),
  );
}
