import { request } from '@/api/client';
import type { InterestResponse } from '@/api/types';

/**
 * Mark me interested in a place. Pass `viaSavedPlaceId` when this came from a friend's saved
 * place for the same place (400 if it's mine, hidden, or for a different place). Marking it
 * again keeps the existing interest unchanged.
 */
export function markInterested(placeId: number, viaSavedPlaceId?: number): Promise<InterestResponse> {
  return request(`/api/places/${placeId}/interest/`, {
    method: 'POST',
    body: viaSavedPlaceId !== undefined ? { via_saved_place_id: viaSavedPlaceId } : {},
  });
}

/** Unmark interest. Fine to call when I wasn't interested. */
export function unmarkInterested(placeId: number): Promise<null> {
  return request(`/api/places/${placeId}/interest/`, { method: 'DELETE' });
}
