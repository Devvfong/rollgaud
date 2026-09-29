import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { db } from '@devdeploy/db';

import { PrismaJobRepository } from '../src/queue/job-repository.js';
import { Worker } from '../src/queue/worker.js';

const projectConfig = {
  slug: 'worker-test',
  name: 'Worker test project',
  repository: 'example/student-api',
  branch: 'main',
  imageNamespace: 'ghcr.io/example/student-api',
  domain: 'worker-test.example.test',
  port: 3000,
  healthPath: '/health',
};

async function queuedProject(suffix: string) {
  const project = await db.project.create({
    data: {
      ...projectConfig,
      slug: `worker-${suffix}`,
      domain: `worker-${suffix}.example.test`,
    },
  });
  const release = await db.release.create({
    data: {
      projectId: project.id,
      commitSha: '0123456789abcdef0123456789abcdef01234567',
      workflowRunId: `worker-${suffix}`,
      imageDigest: `ghcr.io/example/student-api@sha256:${'a'.repeat(64)}`,
      scanPolicyVersion: 'v1',
    },
  });
  const first = await db.deployment.create({ data: { projectId: project.id, releaseId: release.id, trigger: 'ci' } });
  const second = await db.deployment.create({ data: { projectId: project.id, releaseId: release.id, trigger: 'ci' } });
  return { project, first, second };
}

test('two workers claim only one queued job for a project and persist a lease', { skip: !process.env.DATABASE_URL }, async (t) => {
  const fixture = await queuedProject(randomUUID());
  t.after(async () => {
    await db.project.delete({ where: { id: fixture.project.id } });
    await db.$disconnect();
  });

  const now = new Date('2026-09-29T01:00:00.000Z');
  const repository = new PrismaJobRepository({ now: () => now, leaseDurationMs: 60_000 });
  const [first, second] = await Promise.all([
    new Worker(repository).claimOne(fixture.project.id),
    new Worker(repository).claimOne(fixture.project.id),
  ]);

  const claimed = [first, second].filter((value) => value !== null);
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0]?.id, fixture.first.id);
  assert.equal(claimed[0]?.status, 'preparing');
  assert.equal(claimed[0]?.leaseUntil.toISOString(), '2026-09-29T01:01:00.000Z');
  assert.equal((await db.deployment.findUniqueOrThrow({ where: { id: fixture.second.id } })).status, 'queued');
  assert.deepEqual(
    (await db.deploymentEvent.findMany({ where: { deploymentId: fixture.first.id }, orderBy: { sequence: 'asc' } })).map((event) => event.eventCode),
    ['WORKER_CLAIMED'],
  );
});

test('an expired lease blocks new work and can only be handled by later reconciliation', { skip: !process.env.DATABASE_URL }, async (t) => {
  const fixture = await queuedProject(randomUUID());
  t.after(async () => {
    await db.project.delete({ where: { id: fixture.project.id } });
    await db.$disconnect();
  });

  const now = new Date('2026-09-29T01:00:00.000Z');
  await db.deployment.update({
    where: { id: fixture.first.id },
    data: { status: 'preparing', startedAt: new Date(now.valueOf() - 120_000), leaseUntil: new Date(now.valueOf() - 60_000) },
  });
  const repository = new PrismaJobRepository({ now: () => now, leaseDurationMs: 60_000 });

  assert.equal(await new Worker(repository).claimOne(fixture.project.id), null);
  assert.equal(await repository.renewLease(fixture.first.id), false);
  assert.equal((await db.deployment.findUniqueOrThrow({ where: { id: fixture.second.id } })).status, 'queued');
});
