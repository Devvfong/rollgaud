import type { ProjectConfig } from '@devdeploy/contracts';
import type { Slot } from '../runtime/docker-compose-adapter.js';
import type { RouteSnapshot } from '../routing/route-file.js';

export interface DeploymentStore { load(id: string): Promise<{ id: string; releaseId: string; project: ProjectConfig; imageDigest: string; commitSha: string; previous?: { commitSha: string; slot: Slot; snapshot: RouteSnapshot } }>; status(id: string, status: 'preparing' | 'probing' | 'switching' | 'succeeded' | 'failed' | 'rolled_back' | 'recovery_failed'): Promise<void>; event(id: string, code: string, message: string): Promise<void>; setCurrent(project: ProjectConfig, releaseId: string): Promise<void>; }
export interface DeploymentAdapters { runtime: { pull(digest: string): Promise<void>; start(project: ProjectConfig, slot: Slot, digest: string): Promise<void>; stop(project: ProjectConfig, slot: Slot): Promise<void> }; routes: { activate(project: ProjectConfig, slot: Slot): Promise<RouteSnapshot>; restore(project: ProjectConfig, snapshot: RouteSnapshot): Promise<void> }; internal(project: ProjectConfig, slot: Slot, sha: string): Promise<void>; public(project: ProjectConfig, sha: string): Promise<void>; }

export async function deployAttempt(id: string, store: DeploymentStore, adapters: DeploymentAdapters): Promise<void> {
  const attempt = await store.load(id); const slot: Slot = attempt.previous?.slot === 'blue' ? 'green' : 'blue';
  await store.status(id, 'preparing');
  try { await adapters.runtime.pull(attempt.imageDigest); await adapters.runtime.start(attempt.project, slot, attempt.imageDigest); await store.status(id, 'probing'); await adapters.internal(attempt.project, slot, attempt.commitSha); } catch { await store.status(id, 'failed'); return; }
  await store.status(id, 'switching'); let snapshot: RouteSnapshot | undefined;
    try { snapshot = await adapters.routes.activate(attempt.project, slot); await adapters.public(attempt.project, attempt.commitSha); await store.setCurrent(attempt.project, attempt.releaseId); await store.status(id, 'succeeded'); } catch {
    if (!attempt.previous) { await store.status(id, 'failed'); return; }
    try { await adapters.routes.restore(attempt.project, snapshot ?? attempt.previous.snapshot); await adapters.public(attempt.project, attempt.previous.commitSha); await store.status(id, 'rolled_back'); } catch { await store.status(id, 'recovery_failed'); }
  }
}
