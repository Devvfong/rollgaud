import type { ProjectConfig } from '@devdeploy/contracts';
import type { Slot } from '../runtime/docker-compose-adapter.js';

export class ProbeError extends Error {}
export type Fetcher = (url: string, options: RequestInit) => Promise<Response>;

export async function probeInternal(project: ProjectConfig, slot: Slot, expectedSha: string, deadlineMs = 90_000, fetcher: Fetcher = fetch): Promise<void> {
  await probe(`http://devdeploy-${project.slug}-${slot}:${project.port}`, project, expectedSha, deadlineMs, fetcher);
}

export async function probePublic(project: ProjectConfig, expectedSha: string, deadlineMs = 30_000, fetcher: Fetcher = fetch): Promise<void> {
  await probe(`https://${project.domain}`, project, expectedSha, deadlineMs, fetcher);
}

async function probe(origin: string, project: ProjectConfig, expectedSha: string, deadlineMs: number, fetcher: Fetcher): Promise<void> {
  if (!/^[a-f0-9]{40}$/.test(expectedSha) || !Number.isSafeInteger(deadlineMs) || deadlineMs < 1) throw new ProbeError('probe input is malformed');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), deadlineMs);
  try {
    const health = await fetcher(`${origin}${project.healthPath}`, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (health.status !== 200 || !isHealthy(await json(health))) throw new ProbeError('health probe failed');
    const version = await fetcher(`${origin}/version`, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (version.status !== 200 || !hasCommit(await json(version), expectedSha)) throw new ProbeError('version probe failed');
  } catch (error) {
    if (error instanceof ProbeError) throw error;
    throw new ProbeError('probe timed out or returned malformed data');
  } finally { clearTimeout(timeout); }
}
async function json(response: Response): Promise<unknown> { try { return await response.json(); } catch { throw new ProbeError('response JSON is malformed'); } }
function isHealthy(value: unknown): boolean { return typeof value === 'object' && value !== null && (value as { status?: unknown }).status === 'ok'; }
function hasCommit(value: unknown, sha: string): boolean { return typeof value === 'object' && value !== null && (value as { commitSha?: unknown }).commitSha === sha; }
