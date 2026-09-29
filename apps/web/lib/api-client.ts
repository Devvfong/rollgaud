export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export class ApiNetworkError extends Error {
  readonly retryable = true;
  constructor(cause: unknown) { super('network request failed', { cause }); this.name = 'ApiNetworkError'; }
}
export class ApiError extends Error { constructor(public readonly status: number, public readonly code: string, message = code) { super(message); this.name = 'ApiError'; } }
export class ApiClient {
  constructor(private readonly fetcher: FetchLike = fetch) {}
  get<T>(path: string, cookie?: string): Promise<T> { return this.request<T>('GET', path, undefined, undefined, cookie); }
  mutate<T>(method: string, path: string, body: unknown, csrfToken: string, cookie?: string): Promise<T> { return this.request<T>(method, path, body, csrfToken, cookie); }
  private async request<T>(method: string, path: string, body?: unknown, csrf?: string, cookie?: string): Promise<T> {
    if (!/^\/api\/v1(?:\/|$)/.test(path) || path.includes('://') || path.includes('\\')) throw new TypeError('API path must be relative /api/v1 path');
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) { headers['content-type'] = 'application/json'; headers['X-CSRF-Token'] = csrf ?? ''; }
    if (cookie) headers.cookie = cookie;
    let response: Response;
    try {
      response = await this.fetcher(path, { method, headers, credentials: 'same-origin', cache: 'no-store', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch (error) {
      throw new ApiNetworkError(error);
    }
    let payload: unknown = undefined; try { payload = await response.json(); } catch { if (!response.ok) payload = {}; }
    if (!response.ok) { const code = typeof payload === 'object' && payload !== null && typeof (payload as { code?: unknown }).code === 'string' ? (payload as { code: string }).code : response.status === 401 ? 'UNAUTHORIZED' : 'REQUEST_FAILED'; throw new ApiError(response.status, code); }
    return payload as T;
  }
}
