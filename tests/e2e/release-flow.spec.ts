import assert from 'node:assert/strict';
import test from 'node:test';

import { ReleaseFlowHarness, type ReleaseSha } from './release-flow-harness.ts';

const shaA = 'a'.repeat(40) as ReleaseSha;
const shaB = 'b'.repeat(40) as ReleaseSha;
const shaC = 'c'.repeat(40) as ReleaseSha;

test('healthy A to B release records ordered events and serves B', async () => {
  const flow = new ReleaseFlowHarness(shaA);
  flow.admit(shaB);
  const result = await flow.deploy(shaB);
  assert.equal(result.status, 'succeeded');
  assert.equal(flow.currentSha, shaB);
  assert.deepEqual(result.events, ['RELEASE_ADMITTED', 'PREPARING', 'PROBING', 'SWITCHING', 'SUCCEEDED']);
});

test('scanner rejection does not create or switch a release', () => {
  const flow = new ReleaseFlowHarness(shaA);
  assert.throws(() => flow.admit(shaC, false), /scanner/i);
  assert.equal(flow.currentSha, shaA);
  assert.equal(flow.releaseCount, 0);
});

test('unhealthy C preserves B before traffic changes', async () => {
  const flow = new ReleaseFlowHarness(shaA);
  flow.admit(shaB);
  await flow.deploy(shaB);
  flow.admit(shaC);
  const result = await flow.deploy(shaC, { internalHealthy: false });
  assert.equal(result.status, 'failed');
  assert.equal(flow.currentSha, shaB);
  assert.equal(flow.routeSha, shaB);
});

test('public verification failure restores B and records rolled_back', async () => {
  const flow = new ReleaseFlowHarness(shaA);
  flow.admit(shaB);
  await flow.deploy(shaB);
  flow.admit(shaC);
  const result = await flow.deploy(shaC, { publicHealthy: false });
  assert.equal(result.status, 'rolled_back');
  assert.equal(flow.currentSha, shaB);
  assert.equal(flow.routeSha, shaB);
  assert.deepEqual(result.events.slice(-2), ['SWITCHING', 'ROLLED_BACK']);
});

test('manual rollback creates a new attempt and serves A', async () => {
  const flow = new ReleaseFlowHarness(shaA);
  flow.admit(shaB);
  await flow.deploy(shaB);
  flow.admit(shaA);
  const result = await flow.deploy(shaA, { trigger: 'manual_rollback' });
  assert.equal(result.status, 'succeeded');
  assert.equal(flow.currentSha, shaA);
  assert.notEqual(result.attemptId, flow.attemptIds[0]);
});

test('isolated database restore copies rows without changing the source', () => {
  const flow = new ReleaseFlowHarness(shaB);
  const source = flow.databaseRows;
  const restored = flow.restoreIsolated();
  assert.deepEqual(restored, source);
  assert.notEqual(restored, source);
  assert.equal(flow.currentSha, shaB);
});
