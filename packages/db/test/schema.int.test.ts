import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { db } from '../src/index.js';

async function expectsUniqueConstraint(operation: () => Promise<unknown>): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  });
}

test('PostgreSQL enforces project, release, and event uniqueness without plaintext credential fields', async (t) => {
  const suffix = randomUUID();
  const project = await db.project.create({
    data: {
      slug: `schema-${suffix}`,
      name: 'Schema integration project',
      repository: 'example/student-api',
      branch: 'main',
      imageNamespace: 'ghcr.io/example/student-api',
      domain: `schema-${suffix}.example.test`,
      port: 3000,
      healthPath: '/health',
    },
  });

  t.after(async () => {
    await db.project.delete({ where: { id: project.id } });
    await db.$disconnect();
  });

  await expectsUniqueConstraint(() =>
    db.project.create({
      data: {
        slug: `duplicate-${suffix}`,
        name: 'Duplicate domain project',
        repository: 'example/student-api',
        branch: 'main',
        imageNamespace: 'ghcr.io/example/student-api',
        domain: project.domain,
        port: 3000,
        healthPath: '/health',
      },
    }),
  );

  const release = await db.release.create({
    data: {
      projectId: project.id,
      commitSha: '0123456789abcdef0123456789abcdef01234567',
      workflowRunId: `run-${suffix}`,
      imageDigest: `ghcr.io/example/student-api@sha256:${'a'.repeat(64)}`,
      scanPolicyVersion: 'v1',
    },
  });

  await expectsUniqueConstraint(() =>
    db.release.create({
      data: {
        projectId: project.id,
        commitSha: 'fedcba9876543210fedcba9876543210fedcba98',
        workflowRunId: release.workflowRunId,
        imageDigest: `ghcr.io/example/student-api@sha256:${'b'.repeat(64)}`,
        scanPolicyVersion: 'v1',
      },
    }),
  );

  const deployment = await db.deployment.create({
    data: {
      projectId: project.id,
      releaseId: release.id,
      trigger: 'ci',
      status: 'queued',
    },
  });

  await db.deploymentEvent.create({
    data: {
      deploymentId: deployment.id,
      sequence: 1,
      eventCode: 'RELEASE_ACCEPTED',
      message: 'Release accepted for processing.',
    },
  });

  await expectsUniqueConstraint(() =>
    db.deploymentEvent.create({
      data: {
        deploymentId: deployment.id,
        sequence: 1,
        eventCode: 'IMAGE_PULL_STARTED',
        message: 'Duplicate sequence must be rejected.',
      },
    }),
  );

  const credential = await db.apiCredential.create({
    data: {
      projectId: project.id,
      secretHash: 'synthetic-hash-only',
    },
  });
  assert.deepEqual(Object.keys(credential).sort(), [
    'createdAt',
    'expiresAt',
    'id',
    'lastUsedAt',
    'projectId',
    'revokedAt',
    'secretHash',
  ]);

  const sensitiveColumns = await db.$queryRaw<
    Array<{ table_name: string; column_name: string }>
  >`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('users', 'api_credentials', 'admin_sessions')
      AND (column_name LIKE '%password%' OR column_name LIKE '%secret%' OR column_name LIKE '%token%' OR column_name LIKE '%csrf%')
    ORDER BY table_name, column_name
  `;
  assert.deepEqual(sensitiveColumns, [
    { table_name: 'admin_sessions', column_name: 'csrf_hash' },
    { table_name: 'admin_sessions', column_name: 'token_hash' },
    { table_name: 'api_credentials', column_name: 'secret_hash' },
    { table_name: 'users', column_name: 'password_hash' },
  ]);
});
