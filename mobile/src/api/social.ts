import { request } from '@/api/client';
import type {
  FeedResponse,
  FriendRequest,
  FriendRequestsResponse,
  FriendsResponse,
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

/** My friends, A to Z. */
export function getFriends(): Promise<FriendsResponse> {
  return request('/api/friends/');
}

/** Pending friend requests sent to me, newest first. (The API has no list of ones I sent.) */
export function getFriendRequests(): Promise<FriendRequestsResponse> {
  return request('/api/friends/requests/');
}

/** Accept a pending request sent to me. 404 for anything else. */
export function acceptFriendRequest(requestId: number): Promise<FriendRequest> {
  return request(`/api/friends/requests/${requestId}/accept/`, { method: 'POST' });
}

/** Decline a pending request sent to me. They aren't told; they just see no change. */
export function declineFriendRequest(requestId: number): Promise<FriendRequest> {
  return request(`/api/friends/requests/${requestId}/decline/`, { method: 'POST' });
}

/** Unfriend. Also removes each of us from circles the other owns. 404 if we aren't friends. */
export function unfriend(userId: number): Promise<null> {
  return request(`/api/friends/${userId}/`, { method: 'DELETE' });
}
