import { request } from '@/api/client';
import type { TagsResponse, TagWithCount } from '@/api/types';

/** My tags, A to Z. Needs a login. */
export function getTags(): Promise<TagsResponse> {
  return request('/api/tags/');
}

/** Make a tag. If I already have one with that name (ignoring case), returns that one. */
export function createTag(name: string): Promise<TagWithCount> {
  return request('/api/tags/', { method: 'POST', body: { name } });
}

/** Delete a tag everywhere. The places it was on stay saved. */
export function deleteTag(tagId: number): Promise<null> {
  return request(`/api/tags/${tagId}/`, { method: 'DELETE' });
}
