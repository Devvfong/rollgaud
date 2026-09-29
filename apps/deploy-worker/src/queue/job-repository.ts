import { randomUUID } from 'node:crypto';

import type { DeploymentStatus, ProjectConfig } from '@devdeploy/contracts';
import { db, type Prisma } from '@devdeploy/db';

const activeStatuses: Array<'preparing' | 'probing' | 'switching'> = ['preparing', 'probing', 'switching'];

export interface ClaimedDeployment {
  id: string;
  projectId: string;
  releaseId: string;
  status: DeploymentStatus;
  leaseUntil: Date;
  imageDigest: string;
  project: ProjectConfig;
}

export interface JobRepository {
  claimNext(projectId?: string): Promise<ClaimedDeployment | null>;
  renewLease(id: string): Promise<boolean>;
  recordEvent(id: string, code: string, message: string): Promise<void>;
}

export interface JobRepositoryOptions {
  now?: () => Date;
  leaseDurationMs?: number;
}

export class PrismaJobRepository implements JobRepository {
  private readonly now: () => Date;
  private readonly leaseDurationMs: number;

  constructor(options: JobRepositoryOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.leaseDurationMs = options.leaseDurationMs ?? 60_000;
    if (!Number.isSafeInteger(this.leaseDurationMs) || this.leaseDurationMs < 1_000 || this.leaseDurationMs > 300_000) {
      throw new TypeError('worker lease duration must be between one second and five minutes');
    }
  }

  async claimNext(projectId?: string): Promise<ClaimedDeployment | null> {
    return db.$transaction(async (transaction: Prisma.TransactionClient) => {
      const candidates = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT d."id"
        FROM "deployments" AS d
        INNER JOIN "projects" AS p ON p."id" = d."project_id"
        WHERE d."status" = 'queued'::"DeploymentStatus"
          AND p."status" = 'active'::"ProjectStatus"
          AND (${projectId ?? null}::uuid IS NULL OR d."project_id" = ${projectId ?? null}::uuid)
        ORDER BY d."created_at" ASC, d."id" ASC
        FOR UPDATE OF d SKIP LOCKED
        LIMIT 32
      `;

      for (const candidate of candidates) {
        const deployment = await transaction.deployment.findUniqueOrThrow({
          where: { id: candidate.id }, include: { project: true, release: true },
        });
        // Lock by the database-derived project id. This is held only for this
        // short transaction and serializes competing worker claims per project.
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${deployment.projectId}))`;
        const active = await transaction.deployment.findFirst({
          where: { projectId: deployment.projectId, status: { in: activeStatuses } },
          select: { id: true, leaseUntil: true },
        });
        // An expired lease is deliberately still active: Task 11 must reconcile
        // the container and route state before another attempt can begin.
        if (active) continue;

        const startedAt = this.now();
        const leaseUntil = new Date(startedAt.valueOf() + this.leaseDurationMs);
        const updated = await transaction.deployment.updateMany({
          where: { id: deployment.id, status: 'queued' },
          data: { status: 'preparing', startedAt, leaseUntil },
        });
        if (updated.count !== 1) continue;

        await this.appendEvent(transaction, deployment.id, 'WORKER_CLAIMED', 'Worker claimed queued deployment.');
        return {
          id: deployment.id,
          projectId: deployment.projectId,
          releaseId: deployment.releaseId,
          status: 'preparing' as const,
          leaseUntil,
          imageDigest: deployment.release.imageDigest,
          project: {
            slug: deployment.project.slug,
            repository: deployment.project.repository,
            branch: deployment.project.branch,
            imageNamespace: deployment.project.imageNamespace,
            domain: deployment.project.domain,
            port: deployment.project.port,
            healthPath: deployment.project.healthPath,
          },
        };
      }
      return null;
    });
  }

  async renewLease(id: string): Promise<boolean> {
    const now = this.now();
    const updated = await db.deployment.updateMany({
      where: { id, status: { in: activeStatuses }, leaseUntil: { gt: now } },
      data: { leaseUntil: new Date(now.valueOf() + this.leaseDurationMs) },
    });
    return updated.count === 1;
  }

  async recordEvent(id: string, code: string, message: string): Promise<void> {
    await db.$transaction(async (transaction: Prisma.TransactionClient) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
      await this.appendEvent(transaction, id, code, message);
    });
  }

  private async appendEvent(
    transaction: Prisma.TransactionClient,
    deploymentId: string,
    code: string,
    message: string,
  ): Promise<void> {
    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(code)) throw new TypeError('deployment event code is malformed');
    const safeMessage = redactAndBound(message);
    const latest = await transaction.deploymentEvent.findFirst({
      where: { deploymentId }, orderBy: { sequence: 'desc' }, select: { sequence: true },
    });
    await transaction.deploymentEvent.create({
      data: { id: randomUUID(), deploymentId, sequence: (latest?.sequence ?? 0) + 1, eventCode: code, message: safeMessage },
    });
  }
}

function redactAndBound(message: string): string {
  if (typeof message !== 'string') throw new TypeError('deployment event message must be a string');
  return message
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/)[^\s/@]+@/gi, '$1[REDACTED]@')
    .slice(0, 512);
}
