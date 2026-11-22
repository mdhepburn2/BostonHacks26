import { request } from '@/api/client';
import type { AuthResponse, User } from '@/api/types';

export type Credentials = { username: string; password: string };

/** 400 with {"detail": "Wrong username or password."} on bad credentials. */
export function login(credentials: Credentials): Promise<AuthResponse> {
  return request('/api/auth/login/', { method: 'POST', body: credentials });
}

/** 400 with a field message (e.g. username taken) on bad input. */
export function register(input: Credentials & { email?: string }): Promise<AuthResponse> {
  return request('/api/auth/register/', { method: 'POST', body: input });
}

/** The logged-in user. 401 if the token is no longer valid. */
export function getMe(): Promise<User> {
  return request('/api/me/');
}
