import assert from 'node:assert/strict';
import test from 'node:test';
import { recoverPrevious } from '../src/deploy/recover.js';
import { ensureApprovedImage } from '../src/runtime/image-retention.js';

const project = { slug: 'student-api', repository: 'example/student-api', branch: 'main', imageNamespace: 'ghcr.io/example/student-api', domain: 'student-api.example.test', port: 3000, healthPath: '/health' };
test('first-release failure remains failed and does not claim rollback', async () => {
  const statuses: string[] = [];
  await recoverPrevious('attempt', project, undefined, { async restore() {}, async public() {}, async status(_id, status) { statuses.push(status); } });
  assert.deepEqual(statuses, ['failed']);
});
test('approved older digest is re-pulled when absent and fails closed when registry is unavailable', async () => {
  let pulls = 0; let present = false;
  await ensureApprovedImage('ghcr.io/example/student-api@sha256:' + 'a'.repeat(64), async () => present, async () => { pulls++; present = true; return true; });
  assert.equal(pulls, 1);
  await assert.rejects(ensureApprovedImage('ghcr.io/example/student-api@sha256:' + 'b'.repeat(64), async () => false, async () => false));
});
