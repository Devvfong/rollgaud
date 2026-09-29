import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiClient } from '../lib/api-client.js';
import { getCurrentAdmin, login } from '../lib/session.js';
import { csrfToken } from '../lib/csrf.js';

test('auth client carries CSRF/session contracts and server reads are no-store', async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const client = new ApiClient(async (url, init) => { calls.push({ path: url, init }); return new Response(JSON.stringify(url.endsWith('/csrf') ? { csrfToken: 'csrf' } : { id: 'admin', email: 'admin@example.test' }), { status: 200, headers: { 'content-type': 'application/json' } }); });
  assert.equal(await csrfToken(client, 'devdeploy_session=session'), 'csrf');
  assert.deepEqual(await getCurrentAdmin(client, 'devdeploy_session=session'), { id: 'admin', email: 'admin@example.test' });
  await login(client, 'admin@example.test', 'synthetic-password', 'csrf', 'devdeploy_session=session');
  assert.equal(calls[1].init?.cache, 'no-store');
  assert.equal(calls[2].init?.credentials, 'same-origin');
  assert.equal((calls[2].init?.headers as Record<string, string>)['X-CSRF-Token'], 'csrf');
  await assert.rejects(client.get('/https://evil.invalid', 'cookie'));
});

test('401 is surfaced as an auth error suitable for redirect and no server secret enters requests', async () => {
  const client = new ApiClient(async (_url) => new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401 }));
  await assert.rejects(getCurrentAdmin(client, 'cookie'), (error: unknown) => error instanceof Error && error.name === 'AuthError');
  const source = JSON.stringify(client);
  assert.doesNotMatch(source, /GITHUB_READ_TOKEN|GHCR|workflow/i);
});
