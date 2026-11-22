import { File } from 'expo-file-system';

import { request } from '@/api/client';
import type { IdentifyResponse, PlaceDetail, SearchResponse } from '@/api/types';

/** /identify/ calls a vision model, so it gets a longer timeout than other requests. */
const IDENTIFY_TIMEOUT_MS = 20_000;

export type Coords = { lat: number; lng: number };

export type IdentifyInput = Coords & {
  /** Local file URI of the photo, from the camera. */
  photoUri: string;
  /** True-north heading in degrees. Leave out if unavailable or negative. */
  heading?: number;
};

/** Scan: send a photo plus where the user is and which way they're facing. */
export function identify({ photoUri, lat, lng, heading }: IdentifyInput): Promise<IdentifyResponse> {
  const form = new FormData();
  // Since SDK 58 the global fetch is expo/fetch, which can't send React Native's
  // { uri, name, type } file objects (it throws before any request goes out).
  // expo-file-system's File implements Blob, so expo/fetch can read its bytes.
  form.append('image', new File(photoUri));
  form.append('lat', String(lat));
  form.append('lng', String(lng));
  if (heading !== undefined && heading >= 0) form.append('heading', String(heading));

  return request('/api/identify/', { method: 'POST', body: form, timeoutMs: IDENTIFY_TIMEOUT_MS });
}

/** Search places by name. Pass coords (both lat and lng) to rank nearby places higher. */
export function searchPlaces(q: string, coords?: Coords): Promise<SearchResponse> {
  return request('/api/places/search/', {
    query: { q, lat: coords?.lat, lng: coords?.lng },
  });
}

/** The full place card. */
export function getPlace(id: number | string): Promise<PlaceDetail> {
  return request(`/api/places/${id}/`);
}
