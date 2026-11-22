import { searchUsers } from '@/api/social';
import type { UserSearchResult } from '@/api/types';
import { useDebouncedSearch, type DebouncedSearch } from '@/hooks/use-debounced-search';

/** Searches people by username as the user types (needs a login). */
export function usePeopleSearch(query: string): DebouncedSearch<UserSearchResult> {
  return useDebouncedSearch(query, 1, async (q) => (await searchUsers(q)).results);
}
