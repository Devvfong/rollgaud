import assert from 'node:assert/strict';
import test from 'node:test';

import request from 'supertest';

import { createProductionApiApp } from '../src/index.js';

test('production API persists an anonymous CSRF session in PostgreSQL', { skip: !process.env.DATABASE_URL }, async (t) => {
  const app = await createProductionApiApp();
  t.after(async () => app.close());

  const response = await request(app.getHttpServer()).get('/api/v1/auth/csrf').expect(200);
  assert.equal(typeof response.body.csrfToken, 'string');
  assert.match(response.headers['set-cookie'][0], /devdeploy_session=/);
});
