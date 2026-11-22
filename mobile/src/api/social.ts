import { request } from '@/api/client';
import type { FeedResponse, Profile } from '@/api/types';

/** Home friends feed: friends' saved places I can see, newest save or visit first. */
export function getFeed(limit?: number): Promise<FeedResponse> {
  return request('/api/feed/', { query: { limit } });
}

/** Someone's profile (or mine) with counts. */
export function getProfile(userId: number): Promise<Profile> {
  return request(`/api/users/${userId}/`);
}
