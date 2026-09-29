import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiClient, ApiError, ApiNetworkError } from '../lib/api-client.js';
import { createProject, queueDeployment, queueRollback } from '../lib/deployment-actions.js';
import { pollDeployment } from '../lib/poll-deployment.js';

const config = { name: 'Student API', slug: 'student-api', repository: 'example/student-api', branch: 'main', imageNamespace: 'ghcr.io/example/student-api', domain: 'student-api.example.test', port: 3000, healthPath: '/health' };

test('project creation validates exact fields and queued deployment polls to terminal', async () => {
  const calls: string[] = []; let reads = 0;
  const client = new ApiClient(async (url, init) => { calls.push(url); if (url.endsWith('/projects')) return new Response(JSON.stringify({ id: 'p1', ...config }), { status: 201 }); if (init?.method === 'POST') return new Response(JSON.stringify({ deploymentId: 'd1' }), { status: 202 }); reads++; return new Response(JSON.stringify({ id: 'd1', status: reads === 1 ? 'queued' : 'succeeded', project: { currentSha: 'new' }, events: [] }), { status: 200 }); });
  const project = await createProject(client, config, 'csrf'); assert.equal(project.id, 'p1');
  const queued = await queueDeployment(client, 'p1', 'release-1', 'csrf'); assert.equal(queued.deploymentId, 'd1');
  const final = await pollDeployment('d1', () => {}, new AbortController().signal, client, async () => {}); assert.equal(final.status, 'succeeded'); assert.equal(calls.filter((path) => path.endsWith('/deployments/d1')).length, 2);
});

test('rollback 409 remains a typed active-attempt conflict and polling stops on abort/network failure', async () => {
  const client = new ApiClient(async () => new Response(JSON.stringify({ code: 'ACTIVE_ATTEMPT' }), { status: 409 }));
  await assert.rejects(queueRollback(client, 'p1', 'old-release', 'csrf'), (error: unknown) => error instanceof ApiError && error.status === 409);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(pollDeployment('d1', () => {}, controller.signal, client, async () => {}));
  const network = new ApiClient(async () => { throw new Error('offline'); });
  await assert.rejects(network.get('/api/v1/deployments/d1'), (error: unknown) => error instanceof ApiNetworkError && error.retryable);
});
