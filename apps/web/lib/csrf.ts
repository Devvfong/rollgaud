import type { ApiClient } from './api-client.js';
export async function csrfToken(client: ApiClient, cookie?: string): Promise<string> { const result = await client.get<{ csrfToken?: unknown }>('/api/v1/auth/csrf', cookie); if (typeof result.csrfToken !== 'string' || result.csrfToken.length === 0) throw new TypeError('invalid CSRF response'); return result.csrfToken; }
