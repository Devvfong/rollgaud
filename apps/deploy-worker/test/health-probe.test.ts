import assert from 'node:assert/strict';
import test from 'node:test';

import { ProbeError, probeInternal, probePublic } from '../src/probes/health-probe.js';

const project = { slug: 'student-api', repository: 'example/student-api', branch: 'main', imageNamespace: 'ghcr.io/example/student-api', domain: 'student-api.example.test', port: 3000, healthPath: '/health' };
const sha = '0123456789abcdef0123456789abcdef01234567';

function fetchWith(responses: unknown[]) {
  return async () => responses.shift() as Response;
}

test('internal and public probes require healthy JSON and the exact commit', async () => {
  const fetch = fetchWith([
    new Response(JSON.stringify({ status: 'ok' }), { status: 200 }), new Response(JSON.stringify({ commitSha: sha }), { status: 200 }),
    new Response(JSON.stringify({ status: 'ok' }), { status: 200 }), new Response(JSON.stringify({ commitSha: sha }), { status: 200 }),
  ]);
  await probeInternal(project, 'blue', sha, 100, fetch);
  await probePublic(project, sha, 100, fetch);
});

test('probes reject unhealthy, malformed, wrong-version, and timed-out responses', async () => {
  await assert.rejects(probePublic(project, sha, 100, fetchWith([new Response('{bad', { status: 200 })])), ProbeError);
  await assert.rejects(probeInternal(project, 'blue', sha, 100, fetchWith([new Response(JSON.stringify({ status: 'bad' }), { status: 200 })])), ProbeError);
  await assert.rejects(probePublic(project, sha, 100, fetchWith([
    new Response(JSON.stringify({ status: 'ok' }), { status: 200 }), new Response(JSON.stringify({ commitSha: 'f'.repeat(40) }), { status: 200 }),
  ])), ProbeError);
  await assert.rejects(probePublic(project, sha, 1, async (_url, options) => new Promise((_, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))), ProbeError);
});
