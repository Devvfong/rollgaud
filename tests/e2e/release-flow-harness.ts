import type { ProjectConfig } from '@devdeploy/contracts';
import { deployAttempt } from '../../apps/deploy-worker/dist/src/deploy/deploy-attempt.js';
import type { DeploymentAdapters, DeploymentStore } from '../../apps/deploy-worker/dist/src/deploy/deploy-attempt.js';
import type { Slot } from '../../apps/deploy-worker/dist/src/runtime/docker-compose-adapter.js';
import type { RouteSnapshot } from '../../apps/deploy-worker/dist/src/routing/route-file.js';

export type ReleaseSha = string & { readonly __releaseSha: unique symbol };

type Trigger = 'ci' | 'manual_rollback';
type DeployOptions = {
  internalHealthy?: boolean;
  publicHealthy?: boolean;
  trigger?: Trigger;
};

type AttemptResult = {
  attemptId: string;
  status: 'succeeded' | 'failed' | 'rolled_back' | 'recovery_failed';
  events: string[];
};

const project: ProjectConfig = {
  slug: 'student-api',
  repository: 'example/student-api',
  branch: 'main',
  imageNamespace: 'ghcr.io/example/student-api',
  domain: 'student-api.example.test',
  port: 3000,
  healthPath: '/health',
};

function snapshot(contents: string | null): RouteSnapshot {
  return { contents };
}

export class ReleaseFlowHarness {
  currentSha: ReleaseSha;
  routeSha: ReleaseSha;
  releaseCount = 0;
  readonly attemptIds: string[] = [];
  readonly databaseRows: { projects: ProjectConfig[]; releases: string[]; deployments: string[]; events: string[] };

  private readonly releases = new Set<ReleaseSha>();
  private readonly attempts = new Map<string, { sha: ReleaseSha; previousSha?: ReleaseSha; previousSlot?: Slot; previousSnapshot: RouteSnapshot; events: string[]; status: AttemptResult['status'] }>();
  private activeSlot: Slot = 'blue';
  private nextAttempt = 1;

  constructor(initialSha: ReleaseSha) {
    this.currentSha = initialSha;
    this.routeSha = initialSha;
    this.databaseRows = { projects: [project], releases: [initialSha], deployments: [], events: [] };
  }

  admit(sha: ReleaseSha, scannerApproved = true): void {
    if (!scannerApproved) throw new Error('scanner rejected release');
    this.releases.add(sha);
    this.releaseCount += 1;
    this.databaseRows.releases.push(sha);
  }

  async deploy(sha: ReleaseSha, options: DeployOptions = {}): Promise<AttemptResult> {
    if (!this.releases.has(sha)) throw new Error('release has not been admitted');
    const id = `attempt-${this.nextAttempt++}`;
    const previousSha = this.currentSha;
    const previousSlot = this.activeSlot;
    const previousSnapshot = snapshot(this.routeSha);
    const record = { sha, previousSha, previousSlot, previousSnapshot, events: ['RELEASE_ADMITTED'], status: 'failed' as AttemptResult['status'] };
    this.attempts.set(id, record);
    this.attemptIds.push(id);
    this.databaseRows.deployments.push(id);
    this.databaseRows.events.push(`${id}:RELEASE_ADMITTED`);

    const store: DeploymentStore = {
      load: async () => ({
        id,
        releaseId: sha,
        project,
        imageDigest: `${project.imageNamespace}@sha256:${sha}`,
        commitSha: sha,
        previous: previousSha ? { commitSha: previousSha, slot: previousSlot, snapshot: previousSnapshot } : undefined,
      }),
      status: async (_id, status) => {
        const event = status.toUpperCase();
        record.events.push(event);
        this.databaseRows.events.push(`${id}:${event}`);
        record.status = status === 'succeeded' || status === 'rolled_back' || status === 'recovery_failed' ? status : status === 'failed' ? 'failed' : record.status;
      },
      event: async (_id, code) => {
        record.events.push(code);
        this.databaseRows.events.push(`${id}:${code}`);
      },
      setCurrent: async () => {
        this.currentSha = sha;
        this.routeSha = sha;
        this.activeSlot = previousSlot === 'blue' ? 'green' : 'blue';
      },
    };

    const adapters: DeploymentAdapters = {
      runtime: {
        pull: async () => undefined,
        start: async () => undefined,
        stop: async () => undefined,
      },
      routes: {
        activate: async (_project, slot) => {
          this.routeSha = sha;
          this.activeSlot = slot;
          return previousSnapshot;
        },
        restore: async (_project, oldSnapshot) => {
          this.routeSha = oldSnapshot.contents as ReleaseSha;
          this.activeSlot = previousSlot;
        },
      },
      internal: async () => {
        if (options.internalHealthy === false) throw new Error('candidate internal health failed');
      },
      public: async (_project, expectedSha) => {
        if (expectedSha === sha && options.publicHealthy === false) throw new Error('candidate public verification failed');
        if (expectedSha !== this.routeSha) throw new Error('public route served unexpected commit');
      },
    };

    await deployAttempt(id, store, adapters);
    return { attemptId: id, status: record.status, events: [...record.events] };
  }

  restoreIsolated(): typeof this.databaseRows {
    return structuredClone(this.databaseRows);
  }
}
