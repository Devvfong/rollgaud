import { ApiError, type ApiClient } from './api-client.js';
export class AuthError extends Error { constructor() { super('authentication required'); this.name = 'AuthError'; } }
export interface AdminUser { id: string; email: string; }
function admin(value: unknown): AdminUser {
  if (typeof value !== 'object' || value === null || typeof (value as { id?: unknown }).id !== 'string' || typeof (value as { email?: unknown }).email !== 'string') throw new TypeError('invalid administrator response');
  return { id: (value as { id: string }).id, email: (value as { email: string }).email };
}
export async function getCurrentAdmin(client: ApiClient, cookie?: string): Promise<AdminUser> { try { return admin(await client.get<unknown>('/api/v1/auth/me', cookie)); } catch (error) { if (error instanceof ApiError && error.status === 401) throw new AuthError(); throw error; } }
export async function login(client: ApiClient, email: string, password: string, csrf: string, cookie?: string): Promise<AdminUser> { if (!email || !password || !csrf) throw new TypeError('login fields are required'); return admin(await client.mutate<unknown>('POST', '/api/v1/auth/login', { email, password }, csrf, cookie)); }
