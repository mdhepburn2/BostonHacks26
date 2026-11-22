import { request } from '@/api/client';
import type { SavedListResponse, SavedPlace, Visibility } from '@/api/types';

export type SavedSort = 'saved' | 'visited' | 'name';

export type SavedFilters = {
  q?: string;
  visited?: boolean;
  sort?: SavedSort;
};

/** "My saved locations", newest first by default. Needs a login. */
export function getSaved(filters: SavedFilters = {}): Promise<SavedListResponse> {
  return request('/api/saved/', {
    query: {
      q: filters.q,
      visited: filters.visited === undefined ? undefined : String(filters.visited),
      sort: filters.sort,
    },
  });
}

export type SavedChanges = {
  visited?: boolean;
  /** "YYYY-MM-DD", not in the future. Sending it marks the place visited. */
  visited_at?: string;
  /** private (only me), friends, circle (with circle_id) or public (anyone logged in). */
  visibility?: Visibility;
  /** Required when visibility is "circle": a circle I belong to. */
  circle_id?: number;
  /** Replaces the whole set of tags (my own tag ids); [] clears them. */
  tag_ids?: number[];
};

/** Save a place. Returns the existing saved place unchanged if it was already saved. */
export function savePlace(placeId: number, changes: SavedChanges = {}): Promise<SavedPlace> {
  return request('/api/saved/', { method: 'POST', body: { place_id: placeId, ...changes } });
}

/** Update visited / visited_at / visibility. `visited: false` clears the date. */
export function updateSaved(savedId: number, changes: SavedChanges): Promise<SavedPlace> {
  return request(`/api/saved/${savedId}/`, { method: 'PATCH', body: changes });
}

/** Unsave. Its note and tags go with it. */
export function unsave(savedId: number): Promise<null> {
  return request(`/api/saved/${savedId}/`, { method: 'DELETE' });
}
