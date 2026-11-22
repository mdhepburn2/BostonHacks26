import { request } from '@/api/client';
import type { SavedListResponse } from '@/api/types';

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
