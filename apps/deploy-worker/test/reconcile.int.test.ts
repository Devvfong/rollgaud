import assert from 'node:assert/strict'; import test from 'node:test';
import { reconcileOnStartup } from '../src/queue/reconcile.js';
const project = { slug: 'student-api', repository: 'example/student-api', branch: 'main', imageNamespace: 'ghcr.io/example/student-api', domain: 'student-api.example.test', port: 3000, healthPath: '/health' };
test('reconciliation is idempotent, preserves a crash-after-route-write as active, and never claims an expired lease', async () => {
  const events: string[] = []; const state = { status: 'switching' as const, current: 'old' };
  const adapters = { async route() { return 'new'; }, async slot() { return true; }, async public(_p: unknown, sha: string) { if (sha !== 'new') throw new Error('wrong'); } };
  const store = { async active() { return { id: 'attempt', status: state.status, project, targetSha: 'new', currentSha: 'old', leaseExpired: true }; }, async status(_id: string, status: string) { events.push(status); }, async event(_id: string, code: string) { events.push(code); } };
  await reconcileOnStartup(store, adapters); await reconcileOnStartup(store, adapters);
  assert.deepEqual(events, ['RECONCILED_ACTIVE', 'RECONCILED_ACTIVE']);
});
