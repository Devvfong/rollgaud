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

const project = {
  slug: 'student-api',
  name: 'Student API',
  repository: 'example/student-api',
  branch: 'main',
  imageNamespace: 'ghcr.io/example/student-api',
  domain: 'student-api.example.test',
  port: 3000,
  healthPath: '/health',
};

async function authenticatedCookie(server: Server) {
  const csrf = await request(server).get('/api/v1/auth/csrf').expect(200);
  const login = await request(server)
    .post('/api/v1/auth/login')
    .set('Cookie', csrf.headers['set-cookie'][0])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ email: administrator.email, password: administrator.password })
    .expect(201);
  return login.headers['set-cookie'][0];
}

test('administrator can create, list, and read a validated project', async (t) => {
  const app = await createApiApp({ administrator });
  t.after(async () => app.close());
  const cookie = await authenticatedCookie(app.server);

  const created = await request(app.server).post('/api/v1/projects').set('Cookie', cookie).send(project).expect(201);
  assert.equal(created.body.slug, project.slug);
  const projects = await request(app.server).get('/api/v1/projects').set('Cookie', cookie).expect(200);
  assert.equal(projects.body.length, 1);
  await request(app.server).get(`/api/v1/projects/${created.body.id}`).set('Cookie', cookie).expect(200, created.body);
});

test('project catalog rejects unauthenticated, duplicate, and invalid configuration', async (t) => {
  const app = await createApiApp({ administrator });
  t.after(async () => app.close());
  await request(app.server).get('/api/v1/projects').expect(401);
  const cookie = await authenticatedCookie(app.server);
  await request(app.server).post('/api/v1/projects').set('Cookie', cookie).send(project).expect(201);
  await request(app.server).post('/api/v1/projects').set('Cookie', cookie).send(project).expect(409);

  for (const invalid of [
    { ...project, slug: 'bad-domain', domain: 'not a domain' },
    { ...project, slug: 'bad-path', healthPath: 'health' },
    { ...project, slug: 'bad-image', imageNamespace: 'ghcr.io/foreign/student-api' },
    { ...project, slug: 'bad-port', port: 70000 },
    { ...project, slug: 'compose-injection', composeYaml: 'services: {}' },
  ]) {
    await request(app.server).post('/api/v1/projects').set('Cookie', cookie).send(invalid).expect(400);
  }
});
