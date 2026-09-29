import assert from 'node:assert/strict';
import test from 'node:test';

import { deployAttempt, type DeploymentStore } from '../src/deploy/deploy-attempt.js';

const sha = '0123456789abcdef0123456789abcdef01234567';
const project = { slug: 'student-api', repository: 'example/student-api', branch: 'main', imageNamespace: 'ghcr.io/example/student-api', domain: 'student-api.example.test', port: 3000, healthPath: '/health' };
function fixture(previousSha?: string): DeploymentStore & { states: string[]; current?: string } {
  const states: string[] = [];
  return { states, async load() { return { id: 'attempt', releaseId: 'release-id', project, imageDigest: `ghcr.io/example/student-api@sha256:${'a'.repeat(64)}`, commitSha: sha, previous: previousSha ? { commitSha: previousSha, slot: 'green', snapshot: { contents: 'previous-route' } } : undefined }; }, async status(_id, status) { states.push(status); }, async event() {}, async setCurrent(_project, releaseId) { this.current = releaseId; } };
}
function adapters(overrides: Record<string, unknown> = {}) {
  return { runtime: { async pull() {}, async start() {}, async stop() {} }, routes: { async activate() { return { contents: 'previous-route' }; }, async restore() {} }, async internal() {}, async public() {}, ...overrides };
}

test('healthy candidate starts, probes, switches, verifies publicly, and succeeds', async () => {
  const store = fixture();
  await deployAttempt('attempt', store, adapters());
  assert.deepEqual(store.states, ['preparing', 'probing', 'switching', 'succeeded']);
  assert.equal(store.current, 'release-id');
});

test('unhealthy candidate fails before traffic changes', async () => {
  const store = fixture(); let activated = false;
  await deployAttempt('attempt', store, adapters({ async internal() { throw new Error('unhealthy'); }, routes: { async activate() { activated = true; return { contents: '' }; }, async restore() {} } }));
  assert.deepEqual(store.states, ['preparing', 'probing', 'failed']); assert.equal(activated, false);
});

test('wrong public commit restores and verifies the previous route', async () => {
  const old = 'f'.repeat(40); const store = fixture(old); let restored = false; let calls = 0;
  await deployAttempt('attempt', store, adapters({ async public(_project: unknown, expected: string) { calls++; if (expected === sha) throw new Error('wrong public commit'); }, routes: { async activate() { return { contents: 'previous-route' }; }, async restore() { restored = true; } } }));
  assert.equal(restored, true); assert.equal(calls, 2); assert.deepEqual(store.states, ['preparing', 'probing', 'switching', 'rolled_back']);
});

test('failed first release does not invent a rollback and failed restoration is recovery_failed', async () => {
  const first = fixture();
  await deployAttempt('attempt', first, adapters({ async public() { throw new Error('wrong public commit'); } }));
  assert.deepEqual(first.states, ['preparing', 'probing', 'switching', 'failed']);
  const recovery = fixture('f'.repeat(40));
  await deployAttempt('attempt', recovery, adapters({ async public() { throw new Error('still wrong'); } }));
  assert.deepEqual(recovery.states, ['preparing', 'probing', 'switching', 'recovery_failed']);
});
