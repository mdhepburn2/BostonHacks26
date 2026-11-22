import { request } from '@/api/client';
import type {
  ActivitiesResponse,
  Activity,
  ActivityReply,
  ActivityVisibility,
} from '@/api/types';

/** Every activity I can see (mine included): upcoming soonest first, then past ones. */
export function getActivities(): Promise<ActivitiesResponse> {
  return request('/api/activities/');
}

/** One activity. 404 if I can't see it. */
export function getActivity(activityId: number): Promise<Activity> {
  return request(`/api/activities/${activityId}/`);
}

export type ActivityInput = {
  place_id: number;
  /** 1 to 120 characters. */
  title: string;
  /** ISO datetime, not in the past. */
  starts_at: string;
  description?: string;
  /** Defaults to friends on the server. */
  visibility?: ActivityVisibility;
  /** Required when visibility is "circle": one of my circles. */
  circle_id?: number | null;
};

/** Post an activity. */
export function createActivity(input: ActivityInput): Promise<Activity> {
  return request('/api/activities/', { method: 'POST', body: input });
}

/** Edit an activity (author only). A new `starts_at` can't be in the past. */
export function updateActivity(
  activityId: number,
  changes: Partial<Omit<ActivityInput, 'place_id'>>,
): Promise<Activity> {
  return request(`/api/activities/${activityId}/`, { method: 'PATCH', body: changes });
}

/** Delete an activity (author only). Its replies go with it. */
export function deleteActivity(activityId: number): Promise<null> {
  return request(`/api/activities/${activityId}/`, { method: 'DELETE' });
}

/** Reply interested or going; replying again changes it. Returns the updated activity. */
export function respondToActivity(activityId: number, status: ActivityReply): Promise<Activity> {
  return request(`/api/activities/${activityId}/respond/`, { method: 'POST', body: { status } });
}

/** Remove my reply. Fine to call when I hadn't replied. */
export function removeActivityResponse(activityId: number): Promise<null> {
  return request(`/api/activities/${activityId}/respond/`, { method: 'DELETE' });
}
