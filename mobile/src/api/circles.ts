import { request } from '@/api/client';
import type { Circle, CirclesResponse } from '@/api/types';

/** Circles I own or belong to, A to Z. */
export function getCircles(): Promise<CirclesResponse> {
  return request('/api/circles/');
}

/** One of my circles. 404 if I'm not in it. */
export function getCircle(circleId: number): Promise<Circle> {
  return request(`/api/circles/${circleId}/`);
}

export type CircleInput = { name: string; description?: string };

/** Create a circle. I'm its owner and first member. */
export function createCircle(input: CircleInput): Promise<Circle> {
  return request('/api/circles/', { method: 'POST', body: input });
}

/** Rename or re-describe a circle (owner only). */
export function updateCircle(circleId: number, changes: Partial<CircleInput>): Promise<Circle> {
  return request(`/api/circles/${circleId}/`, { method: 'PATCH', body: changes });
}

/** Delete a circle (owner only). Places shared with it become visible to their owner only. */
export function deleteCircle(circleId: number): Promise<null> {
  return request(`/api/circles/${circleId}/`, { method: 'DELETE' });
}

/** Add a friend to my circle (owner only). 400 if they aren't my friend. */
export function addCircleMember(circleId: number, userId: number): Promise<Circle> {
  return request(`/api/circles/${circleId}/members/`, { method: 'POST', body: { user_id: userId } });
}

/** Remove a member (owner), or leave (my own id, as a member). The owner can't leave. */
export function removeCircleMember(circleId: number, userId: number): Promise<null> {
  return request(`/api/circles/${circleId}/members/${userId}/`, { method: 'DELETE' });
}
