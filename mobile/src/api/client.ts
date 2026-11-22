/**
 * The one place the app talks to the backend. Screens never call fetch directly; they go
 * through the functions in src/api/ (places.ts, ...), which use `request` below.
 */

const RAW_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

if (!RAW_BASE_URL) {
  throw new Error(
    'EXPO_PUBLIC_API_URL is not set. Add it to mobile/.env.local and restart `npx expo start`.',
  );
}

/** Server origin with no trailing slash, e.g. https://venturing.onrender.com */
export const BASE_URL = RAW_BASE_URL.replace(/\/+$/, '');

/** Default timeout. /identify/ calls a vision model, so it passes a longer one. */
const DEFAULT_TIMEOUT_MS = 10_000;

export type ApiErrorKind =
  /** 400: bad input. `message` is the server's explanation, safe to show. */
  | 'bad_request'
  /** 401: not logged in. Send the user to login. */
  | 'unauthorized'
  /** 404: unknown, or not visible to this user. */
  | 'not_found'
  /** 5xx, timeout, or no network. Show a friendly "try again" with a retry button. */
  | 'unavailable';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** HTTP status, or null for network errors and timeouts. */
  readonly status: number | null;

  constructor(kind: ApiErrorKind, message: string, status: number | null) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

// --- Auth token ----------------------------------------------------------
// The auth hook (src/hooks/use-auth.tsx) owns logging in and out and keeping the token in
// secure storage. The client just holds the current one and sends it on every request.

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

/** Called when the server rejects our token (expired, or the user was deleted). */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

const UNAVAILABLE_MESSAGE = "Couldn't reach the server. Check your connection and try again.";

type Query = Record<string, string | number | undefined>;

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  query?: Query;
  /** A plain object is sent as JSON. FormData is sent as multipart. */
  body?: object | FormData;
  timeoutMs?: number;
};

/**
 * Calls `path` (e.g. '/api/places/12/') and returns the parsed JSON.
 * Throws ApiError for every failure, so screens only need to handle one error type.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', query, body, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  const sentToken = authToken;
  if (sentToken) headers.Authorization = `Token ${sentToken}`;
  let payload: string | FormData | undefined;
  if (body instanceof FormData) {
    // Don't set Content-Type: fetch has to add the multipart boundary itself.
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: payload,
      signal: controller.signal,
    });
  } catch {
    // Network failure or our timeout aborting the request.
    throw new ApiError('unavailable', UNAVAILABLE_MESSAGE, null);
  } finally {
    clearTimeout(timer);
  }

  const data = await readJson(response);

  if (response.ok) return data as T;

  const message = errorMessage(data);
  switch (response.status) {
    case 400:
      throw new ApiError('bad_request', message ?? 'Something about that request was off.', 400);
    case 401:
      // A stale token makes even the public endpoints fail, so drop it and log out.
      if (sentToken && sentToken === authToken) onUnauthorized?.();
      throw new ApiError('unauthorized', message ?? 'Please log in.', 401);
    case 404:
      throw new ApiError('not_found', message ?? 'Not found.', 404);
    default:
      throw new ApiError('unavailable', message ?? UNAVAILABLE_MESSAGE, response.status);
  }
}

function buildUrl(path: string, query?: Query): string {
  const url = BASE_URL + (path.startsWith('/') ? path : `/${path}`);
  if (!query) return url;
  const params = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return params.length ? `${url}?${params.join('&')}` : url;
}

async function readJson(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * The API sends {"detail": "..."} for most errors, and DRF validation errors look like
 * {"field": ["message", ...]}. Pull out the first readable message.
 */
function errorMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  if (typeof record.detail === 'string') return record.detail;
  for (const value of Object.values(record)) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  }
  return null;
}

/** GET /api/health/. Used to prove the app can reach the API. */
export function checkHealth(): Promise<{ status: string }> {
  return request('/api/health/');
}
