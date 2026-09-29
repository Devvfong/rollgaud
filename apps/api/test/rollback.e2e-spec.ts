import assert from 'node:assert/strict'; import test from 'node:test';
import request from 'supertest'; import { createApiApp } from '../src/index.js';
const admin = { id: '018f0c18-0f41-7d6b-b970-0f1d0cbf8258', email: 'admin@example.test', password: 'synthetic-test-password-not-a-secret' };
const config = { slug: 'student-api', name: 'Student API', repository: 'example/student-api', branch: 'main', imageNamespace: 'ghcr.io/example/student-api', domain: 'student-api.example.test', port: 3000, healthPath: '/health' };
const release = (n: string) => ({ repository: config.repository, branch: 'main', workflowRunId: n, commitSha: n.padStart(40, 'a'), imageDigest: `ghcr.io/example/student-api@sha256:${n[0].repeat(64)}` });
test('admin queues a new rollback/deploy attempt and active attempt conflicts', async (t) => {
 const api = await createApiApp({ administrator: admin, verifier: { verify: async () => ({}) } }); t.after(() => api.close());
 const csrf = await request(api.server).get('/api/v1/auth/csrf'); const login = await request(api.server).post('/api/v1/auth/login').set('Cookie', csrf.headers['set-cookie'][0]).set('X-CSRF-Token', csrf.body.csrfToken).send({email:admin.email,password:admin.password}); const cookie=login.headers['set-cookie'][0];
 const p=(await request(api.server).post('/api/v1/projects').set('Cookie',cookie).send(config)).body; const token=(await request(api.server).get('/api/v1/auth/csrf').set('Cookie',cookie)).body.csrfToken; const cred=(await request(api.server).post(`/api/v1/projects/${p.id}/credentials`).set('Cookie',cookie).set('X-CSRF-Token',token).send({})).body;
 const admitted=(await request(api.server).post(`/api/v1/ci/projects/${p.id}/releases`).set('Authorization',`Bearer ${cred.token}`).send(release('1'))).body;
 const csrf2=(await request(api.server).get('/api/v1/auth/csrf').set('Cookie',cookie)).body.csrfToken;
 const queued=await request(api.server).post(`/api/v1/projects/${p.id}/deployments`).set('Cookie',cookie).set('X-CSRF-Token',csrf2).send({releaseId:admitted.releaseId}).expect(409); assert.ok(queued.body);
});

test('two concurrent manual actions admit at most one attempt', async (t) => {
 const api = await createApiApp({ administrator: admin, verifier: { verify: async () => ({}) } }); t.after(() => api.close());
 const csrf = await request(api.server).get('/api/v1/auth/csrf'); const login = await request(api.server).post('/api/v1/auth/login').set('Cookie', csrf.headers['set-cookie'][0]).set('X-CSRF-Token', csrf.body.csrfToken).send({email:admin.email,password:admin.password}); const cookie=login.headers['set-cookie'][0];
 const p=(await request(api.server).post('/api/v1/projects').set('Cookie',cookie).send({ ...config, slug: 'rollback-race', domain: 'rollback-race.example.test' })).body; const token=(await request(api.server).get('/api/v1/auth/csrf').set('Cookie',cookie)).body.csrfToken; const cred=(await request(api.server).post(`/api/v1/projects/${p.id}/credentials`).set('Cookie',cookie).set('X-CSRF-Token',token).send({})).body;
 const old=(await request(api.server).post(`/api/v1/ci/projects/${p.id}/releases`).set('Authorization',`Bearer ${cred.token}`).send(release('1'))).body; await api.releaseService.setDeploymentStatus(old.deploymentId, 'succeeded'); await api.releaseService.setCurrentRelease(p.id, old.releaseId);
 const admitted=(await request(api.server).post(`/api/v1/ci/projects/${p.id}/releases`).set('Authorization',`Bearer ${cred.token}`).send(release('2'))).body; await api.releaseService.setDeploymentStatus(admitted.deploymentId, 'succeeded'); await api.releaseService.setCurrentRelease(p.id, admitted.releaseId); const csrf2=(await request(api.server).get('/api/v1/auth/csrf').set('Cookie',cookie)).body.csrfToken;
 const results = await Promise.all([1,2].map(() => request(api.server).post(`/api/v1/projects/${p.id}/rollbacks`).set('Cookie',cookie).set('X-CSRF-Token',csrf2).send({ releaseId: old.releaseId })));
 assert.equal(results.filter((result) => result.status === 202).length, 1); assert.equal(results.filter((result) => result.status === 409).length, 1);
});
