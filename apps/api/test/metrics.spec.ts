import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

import { createApiApp } from '../src/index.js';

const administrator = {
  id: '018f0c18-0f41-7d6b-b970-0f1d0cbf8258',
  email: 'metrics@example.test',
  password: 'synthetic-metrics-password',
};

test('API metrics count requests, 5xx responses, and request latency', async (t) => {
  const app = await createApiApp({ administrator });
  t.after(async () => app.close());

  await request(app.server).get('/api/v1/health/live').expect(200);
  await request(app.server).get('/api/v1/health/ready').expect(503);

  const metrics = await request(app.server).get('/metrics').expect(200);
  assert.match(metrics.headers['content-type'], /text\/plain/);
  assert.match(metrics.text, /devdeploy_http_requests_total/);
  assert.match(metrics.text, /method="GET"/);
  assert.match(metrics.text, /status_code="200"/);
  assert.match(metrics.text, /devdeploy_http_errors_total/);
  assert.match(metrics.text, /status_code="503"/);
  assert.match(metrics.text, /devdeploy_http_request_duration_seconds_count/);
  assert.doesNotMatch(metrics.text, /request[_-]?id/i);
});
