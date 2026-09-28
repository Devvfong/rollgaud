import assert from 'node:assert/strict';
import test from 'node:test';

import request from 'supertest';

import { createApiApp } from '../src/index.js';

const administrator = {
  id: '018f0c18-0f41-7d6b-b970-0f1d0cbf8258',
  email: 'admin@example.test',
  password: 'synthetic-test-password-not-a-secret',
};

test('administrator login requires a bound CSRF token and creates a secure session', async (t) => {
  const app = await createApiApp({ administrator });
  t.after(async () => app.close());

  const csrf = await request(app.server).get('/api/v1/auth/csrf').expect(200);
  const anonymousCookie = csrf.headers['set-cookie'][0];
  assert.equal(typeof csrf.body.csrfToken, 'string');

  await request(app.server)
    .post('/api/v1/auth/login')
    .set('Cookie', anonymousCookie)
    .send({ email: administrator.email, password: administrator.password })
    .expect(403);

  const login = await request(app.server)
    .post('/api/v1/auth/login')
    .set('Cookie', anonymousCookie)
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ email: administrator.email, password: administrator.password })
    .expect(201);
  const sessionCookie = login.headers['set-cookie'][0];
  assert.match(sessionCookie, /HttpOnly/i);
  assert.match(sessionCookie, /Secure/i);
  assert.match(sessionCookie, /SameSite=Strict/i);

  await request(app.server)
    .get('/api/v1/auth/me')
    .set('Cookie', sessionCookie)
    .expect(200, { id: administrator.id, email: administrator.email });
});

test('disabled users, invalid credentials, missing sessions, and repeated failures are rejected', async (t) => {
  const app = await createApiApp({ administrator: { ...administrator, disabled: true } });
  t.after(async () => app.close());

  await request(app.server).get('/api/v1/auth/me').expect(401);
  const csrf = await request(app.server).get('/api/v1/auth/csrf').expect(200);
  const cookie = csrf.headers['set-cookie'][0];

  await request(app.server)
    .post('/api/v1/auth/login')
    .set('Cookie', cookie)
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ email: administrator.email, password: administrator.password })
    .expect(401);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const failureCsrf = await request(app.server).get('/api/v1/auth/csrf').expect(200);
    await request(app.server)
      .post('/api/v1/auth/login')
      .set('Cookie', failureCsrf.headers['set-cookie'][0])
      .set('X-CSRF-Token', failureCsrf.body.csrfToken)
      .send({ email: 'unknown@example.test', password: 'invalid-password' })
      .expect(401);
  }

  const limitedCsrf = await request(app.server).get('/api/v1/auth/csrf').expect(200);
  await request(app.server)
    .post('/api/v1/auth/login')
    .set('Cookie', limitedCsrf.headers['set-cookie'][0])
    .set('X-CSRF-Token', limitedCsrf.body.csrfToken)
    .send({ email: 'unknown@example.test', password: 'invalid-password' })
    .expect(429);
});

test('logout requires CSRF and revokes the authenticated session', async (t) => {
  const app = await createApiApp({ administrator });
  t.after(async () => app.close());

  const csrf = await request(app.server).get('/api/v1/auth/csrf').expect(200);
  const login = await request(app.server)
    .post('/api/v1/auth/login')
    .set('Cookie', csrf.headers['set-cookie'][0])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ email: administrator.email, password: administrator.password })
    .expect(201);
  const sessionCookie = login.headers['set-cookie'][0];

  await request(app.server)
    .post('/api/v1/auth/logout')
    .set('Cookie', sessionCookie)
    .expect(403);

  const logoutCsrf = await request(app.server).get('/api/v1/auth/csrf').set('Cookie', sessionCookie).expect(200);
  await request(app.server)
    .post('/api/v1/auth/logout')
    .set('Cookie', sessionCookie)
    .set('X-CSRF-Token', logoutCsrf.body.csrfToken)
    .expect(204);

  await request(app.server).get('/api/v1/auth/me').set('Cookie', sessionCookie).expect(401);
});
