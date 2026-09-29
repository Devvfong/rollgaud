import { parseProjectConfig, type ProjectSummary } from '@devdeploy/contracts';
import type { ApiClient } from './api-client.js';
const projectFields = ['name', 'slug', 'repository', 'branch', 'imageNamespace', 'domain', 'port', 'healthPath'] as const;
export async function createProject(client: ApiClient, input: Record<string, unknown>, csrf: string): Promise<ProjectSummary> {
  if (Object.keys(input).some((field) => field !== 'name' && !projectFields.includes(field as (typeof projectFields)[number])) || typeof input.name !== 'string' || input.name.length === 0) throw new TypeError('project fields are invalid');
  parseProjectConfig(input);
  const result = await client.mutate<unknown>('POST', '/api/v1/projects', input, csrf);
  if (typeof result !== 'object' || result === null || typeof (result as { id?: unknown }).id !== 'string' || typeof (result as { name?: unknown }).name !== 'string') throw new TypeError('invalid project response');
  const response = result as Record<string, unknown>;
  const responseConfig = parseProjectConfig(response);
  return { id: response.id as string, name: response.name as string, slug: responseConfig.slug, domain: responseConfig.domain, currentSha: null, currentDigest: null, health: 'Unknown', lastAttemptStatus: null };
}
export async function queueDeployment(client: ApiClient, projectId: string, releaseId: string, csrf: string): Promise<{ deploymentId: string }> { return queue(client, `/api/v1/projects/${encodeURIComponent(projectId)}/deployments`, releaseId, csrf); }
export async function queueRollback(client: ApiClient, projectId: string, releaseId: string, csrf: string): Promise<{ deploymentId: string }> { return queue(client, `/api/v1/projects/${encodeURIComponent(projectId)}/rollbacks`, releaseId, csrf); }
async function queue(client: ApiClient, path: string, releaseId: string, csrf: string): Promise<{ deploymentId: string }> { if (!releaseId) throw new TypeError('releaseId is required'); const result = await client.mutate<{ deploymentId?: unknown }>('POST', path, { releaseId }, csrf); if (typeof result.deploymentId !== 'string') throw new TypeError('invalid queued deployment response'); return { deploymentId: result.deploymentId }; }
