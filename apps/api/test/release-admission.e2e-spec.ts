import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import test from 'node:test';

import request from 'supertest';

import { createApiApp } from '../src/index.js';

const administrator = {
  id: '018f0c18-0f41-7d6b-b970-0f1d0cbf8258',
  email: 'admin@example.test',
  password: 'synthetic-test-password-not-a-secret',
};
const projectInput = {
  slug: 'student-api', name: 'Student API', repository: 'example/student-api', branch: 'main',
  imageNamespace: 'ghcr.io/example/student-api', domain: 'student-api.example.test', port: 3000, healthPath: '/health',
};
const release = {
  repository: projectInput.repository, branch: projectInput.branch, workflowRunId: '42',
  commitSha: '0123456789abcdef0123456789abcdef01234567',
  imageDigest: `ghcr.io/example/student-api@sha256:${'a'.repeat(64)}`,
};

async function administratorCookie(server: Server): Promise<string> {
  const csrf = await request(server).get('/api/v1/auth/csrf').expect(200);
  const login = await request(server).post('/api/v1/auth/login')
    .set('Cookie', csrf.headers['set-cookie'][0]).set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ email: administrator.email, password: administrator.password }).expect(201);
  return login.headers['set-cookie'][0];
}

async function csrf(server: Server, cookie: string): Promise<string> {
  return (await request(server).get('/api/v1/auth/csrf').set('Cookie', cookie).expect(200)).body.csrfToken;
}

async function projectAndCredential(server: Server, cookie: string, input = projectInput) {
  const project = await request(server).post('/api/v1/projects').set('Cookie', cookie).send(input).expect(201);
  const csrfToken = await csrf(server, cookie);
  const token = await request(server).post(`/api/v1/projects/${project.body.id}/credentials`).set('Cookie', cookie)
    .set('X-CSRF-Token', csrfToken).send({}).expect(201);
  return { project: project.body, credential: token.body };
}

test('admin creates one scoped credential and CI admission is idempotent with ordered history', async (t) => {
  const api = await createApiApp({ administrator, verifier: { verify: async () => ({ ...release, verifiedAt: new Date() }) } });
  t.after(async () => api.close());
  await request(api.server).post('/api/v1/projects/no-project/credentials').expect(401);
  const cookie = await administratorCookie(api.server);
  const unknownProjectCsrf = await csrf(api.server, cookie);
  await request(api.server).post('/api/v1/projects/no-project/credentials').set('Cookie', cookie)
    .set('X-CSRF-Token', unknownProjectCsrf).send({}).expect(404);
  const createdProject = await request(api.server).post('/api/v1/projects').set('Cookie', cookie).send(projectInput).expect(201);
  const invalidExpiryCsrf = await csrf(api.server, cookie);
  await request(api.server).post(`/api/v1/projects/${createdProject.body.id}/credentials`).set('Cookie', cookie)
    .set('X-CSRF-Token', invalidExpiryCsrf).send({ expiresAt: 'not-a-date' }).expect(400);
  const credentialCsrf = await csrf(api.server, cookie);
  const token = await request(api.server).post(`/api/v1/projects/${createdProject.body.id}/credentials`).set('Cookie', cookie)
    .set('X-CSRF-Token', credentialCsrf).send({}).expect(201);
  const project = createdProject.body;
  const credential = token.body;
  assert.match(credential.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.match(credential.token, /^[A-Za-z0-9_-]{32,}$/);
  assert.equal(credential.secretHash, undefined);

  const admitted = await request(api.server).post(`/api/v1/ci/projects/${project.id}/releases`)
    .set('Authorization', `Bearer ${credential.token}`).send(release).expect(202);
  const duplicate = await request(api.server).post(`/api/v1/ci/projects/${project.id}/releases`)
    .set('Authorization', `Bearer ${credential.token}`).send(release).expect(202);
  assert.deepEqual(duplicate.body, admitted.body);

  const releases = await request(api.server).get(`/api/v1/projects/${project.id}/releases`).set('Cookie', cookie).expect(200);
  assert.equal(releases.body.items.length, 1);
  const history = await request(api.server).get(`/api/v1/projects/${project.id}/deployments?limit=1`).set('Cookie', cookie).expect(200);
  assert.equal(history.body.items.length, 1);
  assert.equal(history.body.nextCursor, null);
  await api.releaseService.recordEvent(admitted.body.deploymentId, 'WORKER_CLAIMED', 'Worker claimed queued deployment.');
  const detail = await request(api.server).get(`/api/v1/deployments/${admitted.body.deploymentId}`).set('Cookie', cookie).expect(200);
  assert.deepEqual(detail.body.events.map((event: { sequence: number }) => event.sequence), [1, 2]);
});

test('workflow credentials reject another project, revocation, and expiry', async (t) => {
  let now = new Date('2026-09-29T00:00:00.000Z');
  const api = await createApiApp({
    administrator, now: () => now, verifier: { verify: async () => ({ ...release, verifiedAt: now }) },
  });
  t.after(async () => api.close());
  const cookie = await administratorCookie(api.server);
  const first = await projectAndCredential(api.server, cookie);
  const second = await projectAndCredential(api.server, cookie, { ...projectInput, slug: 'other-api', domain: 'other-api.example.test' });
  await request(api.server).post(`/api/v1/ci/projects/${second.project.id}/releases`)
    .set('Authorization', `Bearer ${first.credential.token}`).send(release).expect(401);
  const revokeCsrf = await csrf(api.server, cookie);
  await request(api.server).post(`/api/v1/projects/${first.project.id}/credentials/${first.credential.id}/revoke`).set('Cookie', cookie)
    .set('X-CSRF-Token', revokeCsrf).expect(204);
  await request(api.server).post(`/api/v1/ci/projects/${first.project.id}/releases`)
    .set('Authorization', `Bearer ${first.credential.token}`).send(release).expect(401);

  const expiryCsrf = await csrf(api.server, cookie);
  const expires = await request(api.server).post(`/api/v1/projects/${second.project.id}/credentials`).set('Cookie', cookie)
    .set('X-CSRF-Token', expiryCsrf).send({ expiresAt: '2026-09-29T00:01:00.000Z' }).expect(201);
  now = new Date('2026-09-29T00:02:00.000Z');
  await request(api.server).post(`/api/v1/ci/projects/${second.project.id}/releases`)
    .set('Authorization', `Bearer ${expires.body.token}`).send(release).expect(401);
});

test('rejects verifier failures and leaves no partial admission after a queue write failure', async (t) => {
  const outage = await createApiApp({ administrator, verifier: { verify: async () => { throw new Error('github unavailable'); } } });
  t.after(async () => outage.close());
  const outageCookie = await administratorCookie(outage.server);
  const outageProject = await projectAndCredential(outage.server, outageCookie);
  await request(outage.server).post(`/api/v1/ci/projects/${outageProject.project.id}/releases`)
    .set('Authorization', `Bearer ${outageProject.credential.token}`).send(release).expect(422);

  const failedQueue = await createApiApp({ administrator, failQueueInsert: true, verifier: { verify: async () => ({ ...release, verifiedAt: new Date() }) } });
  t.after(async () => failedQueue.close());
  const queueCookie = await administratorCookie(failedQueue.server);
  const queuedProject = await projectAndCredential(failedQueue.server, queueCookie);
  await request(failedQueue.server).post(`/api/v1/ci/projects/${queuedProject.project.id}/releases`)
    .set('Authorization', `Bearer ${queuedProject.credential.token}`).send(release).expect(500);
  const releases = await request(failedQueue.server).get(`/api/v1/projects/${queuedProject.project.id}/releases`).set('Cookie', queueCookie).expect(200);
  assert.deepEqual(releases.body.items, []);
});

test('does not admit a stale run or assign a current release across projects', async (t) => {
  const api = await createApiApp({ administrator, verifier: { verify: async () => ({ ...release, verifiedAt: new Date() }) } });
  t.after(async () => api.close());
  const cookie = await administratorCookie(api.server);
  const first = await projectAndCredential(api.server, cookie);
  const second = await projectAndCredential(api.server, cookie, { ...projectInput, slug: 'second-api', domain: 'second-api.example.test' });
  const newer = { ...release, workflowRunId: '43', commitSha: 'fedcba9876543210fedcba9876543210fedcba98', imageDigest: `ghcr.io/example/student-api@sha256:${'b'.repeat(64)}` };
  const admitted = await request(api.server).post(`/api/v1/ci/projects/${first.project.id}/releases`)
    .set('Authorization', `Bearer ${first.credential.token}`).send(newer).expect(202);
  await api.releaseService.setCurrentRelease(first.project.id, admitted.body.releaseId);
  await request(api.server).post(`/api/v1/ci/projects/${first.project.id}/releases`)
    .set('Authorization', `Bearer ${first.credential.token}`).send(release).expect(409);
  await assert.rejects(api.releaseService.setCurrentRelease(second.project.id, admitted.body.releaseId));
});
