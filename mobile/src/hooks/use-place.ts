import { getPlace } from '@/api/places';
import type { PlaceDetail } from '@/api/types';
import { useAuth } from '@/hooks/use-auth';
import { useRequest, type RequestState } from '@/hooks/use-request';

/** Loads the full place card for `id`. Reloads on login / logout, since `saved` depends on it. */
export function usePlace(id: string): RequestState<PlaceDetail> {
  const { status, user } = useAuth();
  // Wait for the saved login so the first request already carries the token.
  const key = status === 'loading' ? null : `place:${id}:${user?.id ?? 'guest'}`;
  return useRequest(key, () => getPlace(id));
}
