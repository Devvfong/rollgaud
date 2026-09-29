import { randomUUID } from 'node:crypto';

import { parseReleaseIdentity, type DeploymentStatus, type ProjectConfig, type ReleaseIdentity } from '@devdeploy/contracts';
import { db } from '@devdeploy/db';

export interface ReleaseVerifier {
  verify(project: ProjectConfig, submitted: ReleaseIdentity): Promise<unknown>;
}

export interface StoredRelease {
  id: string;
  projectId: string;
  commitSha: string;
  workflowRunId: string;
  imageDigest: string;
  approvedAt: Date;
  createdAt: Date;
}

export interface StoredDeployment {
  id: string;
  projectId: string;
  releaseId: string;
  status: DeploymentStatus;
  createdAt: Date;
}

export interface StoredDeploymentEvent {
  id: string;
  deploymentId: string;
  sequence: number;
  eventCode: string;
  message: string;
  createdAt: Date;
}

export interface AdmissionResult {
  release: StoredRelease;
  deployment: StoredDeployment;
  duplicate: boolean;
}

export interface ReleaseStore {
  findAdmission(projectId: string, workflowRunId: string): Promise<AdmissionResult | null>;
  admit(project: ProjectConfig & { id: string }, release: ReleaseIdentity): Promise<AdmissionResult>;
  listReleases(projectId: string): Promise<StoredRelease[]>;
  listDeployments(projectId: string, cursor: string | undefined, limit: number): Promise<{ items: StoredDeployment[]; nextCursor: string | null }>;
  findDeployment(id: string): Promise<(StoredDeployment & { events: StoredDeploymentEvent[] }) | null>;
  setCurrentRelease(projectId: string, releaseId: string): Promise<void>;
  recordEvent(deploymentId: string, eventCode: string, message: string): Promise<void>;
}

export class StaleReleaseError extends Error {}
export class CrossProjectReleaseError extends Error {}
export class ReleaseVerificationError extends Error {}
export class QueueInsertionError extends Error {}

export class InMemoryReleaseStore implements ReleaseStore {
  private readonly releases = new Map<string, StoredRelease>();
  private readonly deployments = new Map<string, StoredDeployment>();
  private readonly events = new Map<string, StoredDeploymentEvent[]>();
  private readonly currentReleaseIds = new Map<string, string>();

  constructor(private readonly options: { failQueueInsert?: boolean; now?: () => Date } = {}) {}

  async findAdmission(projectId: string, workflowRunId: string): Promise<AdmissionResult | null> {
    const release = [...this.releases.values()].find((candidate) => candidate.projectId === projectId && candidate.workflowRunId === workflowRunId);
    if (!release) return null;
    const deployment = [...this.deployments.values()].find((candidate) => candidate.releaseId === release.id);
    return deployment ? { release, deployment, duplicate: true } : null;
  }

  async admit(project: ProjectConfig & { id: string }, identity: ReleaseIdentity): Promise<AdmissionResult> {
    const existing = await this.findAdmission(project.id, identity.workflowRunId);
    if (existing) return existing;
    const currentId = this.currentReleaseIds.get(project.id);
    const current = currentId ? this.releases.get(currentId) : undefined;
    if (current && BigInt(identity.workflowRunId) <= BigInt(current.workflowRunId)) throw new StaleReleaseError();
    if (this.options.failQueueInsert) throw new QueueInsertionError('queue write failed');
    const now = (this.options.now ?? (() => new Date()))();
    const release: StoredRelease = { id: randomUUID(), projectId: project.id, commitSha: identity.commitSha, workflowRunId: identity.workflowRunId, imageDigest: identity.imageDigest, approvedAt: now, createdAt: now };
    const deployment: StoredDeployment = { id: randomUUID(), projectId: project.id, releaseId: release.id, status: 'queued', createdAt: now };
    const event: StoredDeploymentEvent = { id: randomUUID(), deploymentId: deployment.id, sequence: 1, eventCode: 'RELEASE_ADMITTED', message: 'Release admitted and queued.', createdAt: now };
    this.releases.set(release.id, release);
    this.deployments.set(deployment.id, deployment);
    this.events.set(deployment.id, [event]);
    return { release, deployment, duplicate: false };
  }

  async listReleases(projectId: string): Promise<StoredRelease[]> {
    return [...this.releases.values()].filter((release) => release.projectId === projectId).sort((left, right) => left.createdAt.valueOf() - right.createdAt.valueOf());
  }

  async listDeployments(projectId: string, cursor: string | undefined, limit: number) {
    const all = [...this.deployments.values()].filter((deployment) => deployment.projectId === projectId).sort((left, right) => left.createdAt.valueOf() - right.createdAt.valueOf());
    const start = cursor ? all.findIndex((deployment) => deployment.id === cursor) + 1 : 0;
    const items = all.slice(Math.max(start, 0), Math.max(start, 0) + limit);
    return { items, nextCursor: start + limit < all.length ? items.at(-1)?.id ?? null : null };
  }

  async findDeployment(id: string) {
    const deployment = this.deployments.get(id);
    return deployment ? { ...deployment, events: [...(this.events.get(id) ?? [])].sort((left, right) => left.sequence - right.sequence) } : null;
  }

  async setCurrentRelease(projectId: string, releaseId: string): Promise<void> {
    const release = this.releases.get(releaseId);
    if (!release || release.projectId !== projectId) throw new CrossProjectReleaseError();
    this.currentReleaseIds.set(projectId, release.id);
  }

  async recordEvent(deploymentId: string, eventCode: string, message: string): Promise<void> {
    const events = this.events.get(deploymentId);
    if (!events) throw new Error('deployment not found');
    events.push({ id: randomUUID(), deploymentId, sequence: events.length + 1, eventCode, message, createdAt: (this.options.now ?? (() => new Date()))() });
  }
}

export class PrismaReleaseStore implements ReleaseStore {
  async findAdmission(projectId: string, workflowRunId: string): Promise<AdmissionResult | null> {
    const release = await db.release.findUnique({ where: { projectId_workflowRunId: { projectId, workflowRunId } } });
    if (!release) return null;
    const deployment = await db.deployment.findFirst({ where: { releaseId: release.id }, orderBy: { createdAt: 'asc' } });
    return deployment ? { release, deployment, duplicate: true } : null;
  }

  async admit(project: ProjectConfig & { id: string }, identity: ReleaseIdentity): Promise<AdmissionResult> {
    try {
      return await db.$transaction(async (transaction) => {
        const existing = await transaction.release.findUnique({ where: { projectId_workflowRunId: { projectId: project.id, workflowRunId: identity.workflowRunId } } });
        if (existing) {
          const deployment = await transaction.deployment.findFirstOrThrow({ where: { releaseId: existing.id }, orderBy: { createdAt: 'asc' } });
          return { release: existing, deployment, duplicate: true };
        }
        const state = await transaction.project.findUniqueOrThrow({ where: { id: project.id }, include: { currentRelease: true } });
        if (state.currentRelease && BigInt(identity.workflowRunId) <= BigInt(state.currentRelease.workflowRunId)) throw new StaleReleaseError();
        const release = await transaction.release.create({ data: { projectId: project.id, commitSha: identity.commitSha, workflowRunId: identity.workflowRunId, imageDigest: identity.imageDigest, scanPolicyVersion: 'v1' } });
        const deployment = await transaction.deployment.create({ data: { projectId: project.id, releaseId: release.id, trigger: 'ci', status: 'queued' } });
        await transaction.deploymentEvent.create({ data: { deploymentId: deployment.id, sequence: 1, eventCode: 'RELEASE_ADMITTED', message: 'Release admitted and queued.' } });
        return { release, deployment, duplicate: false };
      });
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        const admission = await this.findAdmission(project.id, identity.workflowRunId);
        if (admission) return admission;
      }
      throw error;
    }
  }

  async listReleases(projectId: string): Promise<StoredRelease[]> {
    return db.release.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } });
  }

  async listDeployments(projectId: string, cursor: string | undefined, limit: number) {
    const items = await db.deployment.findMany({ where: { projectId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: limit + 1 });
    const page = items.slice(0, limit);
    return { items: page, nextCursor: items.length > limit ? page.at(-1)?.id ?? null : null };
  }

  async findDeployment(id: string) {
    const deployment = await db.deployment.findUnique({ where: { id }, include: { events: { orderBy: { sequence: 'asc' } } } });
    return deployment;
  }

  async setCurrentRelease(projectId: string, releaseId: string): Promise<void> {
    await db.$transaction(async (transaction) => {
      const release = await transaction.release.findUnique({ where: { id: releaseId } });
      if (!release || release.projectId !== projectId) throw new CrossProjectReleaseError();
      await transaction.project.update({ where: { id: projectId }, data: { currentReleaseId: releaseId } });
    });
  }

  async recordEvent(deploymentId: string, eventCode: string, message: string): Promise<void> {
    await db.$transaction(async (transaction) => {
      const latest = await transaction.deploymentEvent.findFirst({ where: { deploymentId }, orderBy: { sequence: 'desc' } });
      await transaction.deploymentEvent.create({ data: { deploymentId, sequence: (latest?.sequence ?? 0) + 1, eventCode, message } });
    });
  }
}

export class ReleaseAdmissionService {
  constructor(private readonly store: ReleaseStore, private readonly verifier: ReleaseVerifier, private readonly findProject: (id: string) => Promise<(ProjectConfig & { id: string }) | null>) {}

  async admit(projectId: string, input: unknown): Promise<AdmissionResult> {
    const identity = parseReleaseIdentity(input);
    const project = await this.findProject(projectId);
    if (!project) throw new Error('project not found');
    const duplicate = await this.store.findAdmission(projectId, identity.workflowRunId);
    if (duplicate) return duplicate;
    try {
      await this.verifier.verify(project, identity);
    } catch {
      throw new ReleaseVerificationError();
    }
    return this.store.admit(project, identity);
  }

  async listReleases(projectId: string) { return this.store.listReleases(projectId); }
  async listDeployments(projectId: string, cursor: string | undefined, limit: number) { return this.store.listDeployments(projectId, cursor, limit); }
  async deployment(id: string) { return this.store.findDeployment(id); }
  async setCurrentRelease(projectId: string, releaseId: string) { return this.store.setCurrentRelease(projectId, releaseId); }
  async recordEvent(deploymentId: string, eventCode: string, message: string) { return this.store.recordEvent(deploymentId, eventCode, message); }
}
