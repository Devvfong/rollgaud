import type { ProjectConfig } from '@devdeploy/contracts';
import type { RouteSnapshot } from '../routing/route-file.js';
export interface RecoveryAdapters { restore(project: ProjectConfig, snapshot: RouteSnapshot): Promise<void>; public(project: ProjectConfig, sha: string): Promise<void>; status(id: string, value: 'failed' | 'rolled_back' | 'recovery_failed'): Promise<void>; }
export async function recoverPrevious(id: string, project: ProjectConfig, previous: { commitSha: string; snapshot: RouteSnapshot } | undefined, adapters: RecoveryAdapters): Promise<void> {
  if (!previous) { await adapters.status(id, 'failed'); return; }
  try { await adapters.restore(project, previous.snapshot); await adapters.public(project, previous.commitSha); await adapters.status(id, 'rolled_back'); } catch { await adapters.status(id, 'recovery_failed'); }
}
