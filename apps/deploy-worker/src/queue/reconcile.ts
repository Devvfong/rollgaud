import type { ProjectConfig } from '@devdeploy/contracts';
export interface ReconcileStore { active(): Promise<{ id: string; status: string; project: ProjectConfig; targetSha: string; currentSha: string | null; leaseExpired: boolean } | null>; status(id: string, status: 'succeeded' | 'failed' | 'recovery_failed'): Promise<void>; event(id: string, code: string): Promise<void>; }
export interface ReconcileAdapters { route(project: ProjectConfig): Promise<string | null>; slot(project: ProjectConfig, sha: string): Promise<boolean>; public(project: ProjectConfig, sha: string): Promise<void>; }
export async function reconcileOnStartup(store: ReconcileStore, adapters: ReconcileAdapters): Promise<void> {
 const attempt = await store.active(); if (!attempt) return;
 try { const route = await adapters.route(attempt.project); const slot = await adapters.slot(attempt.project, attempt.targetSha); if (route === attempt.targetSha && slot) { await adapters.public(attempt.project, attempt.targetSha); await store.event(attempt.id, 'RECONCILED_ACTIVE'); return; } if (attempt.leaseExpired) { await store.event(attempt.id, 'RECONCILIATION_REQUIRED'); return; } await store.event(attempt.id, 'RECONCILED_WAITING'); } catch { await store.status(attempt.id, 'recovery_failed'); }
}
