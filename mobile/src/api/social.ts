import { request } from '@/api/client';
import type {
  CirclesResponse,
  FeedResponse,
  FriendRequest,
  Profile,
  SavedListResponse,
  UserSearchResponse,
} from '@/api/types';

/** Home friends feed: friends' saved places I can see, newest save or visit first. */
export function getFeed(limit?: number): Promise<FeedResponse> {
  return request('/api/feed/', { query: { limit } });
}

/** Someone's profile (or mine) with counts. */
export function getProfile(userId: number): Promise<Profile> {
  return request(`/api/users/${userId}/`);
}

/** Circles I own or belong to, A to Z. */
export function getCircles(): Promise<CirclesResponse> {
  return request('/api/circles/');
}

/**
 * Someone's saved places that I'm allowed to see (all of them for my own id), newest first.
 * Empty, not an error, when nothing is visible.
 */
export function getUserSaved(userId: number): Promise<SavedListResponse> {
  return request(`/api/users/${userId}/saved/`);
}

/** Find people by username (part of it, ignoring case). Never includes me. At most 20. */
export function searchUsers(q: string): Promise<UserSearchResponse> {
  return request('/api/users/search/', { query: { q } });
}

/**
 * Send a friend request. If they already asked me, this accepts theirs instead
 * (`status: "accepted"`). 400 if we're already friends.
 */
export function sendFriendRequest(username: string): Promise<FriendRequest> {
  return request('/api/friends/requests/', { method: 'POST', body: { username } });
}
