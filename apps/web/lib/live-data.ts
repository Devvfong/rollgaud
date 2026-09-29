import type { ApiClient } from './api-client.js';
import { parseProjectConfig, type DashboardSummary, type DeploymentDetail, type DeploymentEvent, type ProjectDetail, type ProjectSummary, type ReleaseSummary } from '@devdeploy/contracts';

type RecordValue = Record<string, unknown>;

function record(value: unknown, label: string): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as RecordValue;
}
function stringField(value: RecordValue, field: string, label: string): string {
  if (typeof value[field] !== 'string' || value[field] === '') throw new TypeError(`${label}.${field} must be a non-empty string`);
  return value[field] as string;
}
function nullableString(value: RecordValue, field: string, label: string): string | null {
  if (value[field] === null || value[field] === undefined) return null;
  return stringField(value, field, label);
}
function dateField(value: RecordValue, field: string, label: string): string {
  const date = stringField(value, field, label);
  if (Number.isNaN(Date.parse(date))) throw new TypeError(`${label}.${field} must be an ISO date`);
  return date;
}

function projectSummary(value: unknown): ProjectSummary {
  const item = record(value, 'project');
  const config = parseProjectConfig(item);
  return {
    id: stringField(item, 'id', 'project'), name: stringField(item, 'name', 'project'), slug: config.slug, domain: config.domain,
    currentSha: null, currentDigest: null, health: 'Unknown', lastAttemptStatus: null,
  };
}

function release(value: unknown): ReleaseSummary & { projectId: string; workflowRunId: string } {
  const item = record(value, 'release');
  return {
    id: stringField(item, 'id', 'release'), projectId: stringField(item, 'projectId', 'release'), workflowRunId: stringField(item, 'workflowRunId', 'release'),
    commitSha: stringField(item, 'commitSha', 'release'), imageDigest: stringField(item, 'imageDigest', 'release'), approvedAt: dateField(item, 'approvedAt', 'release'), status: 'approved',
  };
}

function status(value: unknown, label: string): DeploymentDetail['status'] {
  if (value === 'queued' || value === 'preparing' || value === 'probing' || value === 'switching' || value === 'succeeded' || value === 'failed' || value === 'rolled_back' || value === 'recovery_failed' || value === 'cancelled') return value;
  throw new TypeError(`${label}.status is invalid`);
}

function events(value: unknown): DeploymentEvent[] {
  if (!Array.isArray(value)) throw new TypeError('deployment.events must be an array');
  return value.map((entry, index) => {
    const item = record(entry, `deployment.events[${index}]`);
    const sequence = item.sequence;
    if (!Number.isInteger(sequence) || (sequence as number) < 1) throw new TypeError('deployment event sequence is invalid');
    return { sequence: sequence as number, eventCode: stringField(item, 'eventCode', 'deployment event'), message: stringField(item, 'message', 'deployment event'), createdAt: dateField(item, 'createdAt', 'deployment event') };
  }).sort((left, right) => left.sequence - right.sequence);
}

function deployment(value: unknown, project: ProjectSummary, releases: Map<string, ReleaseSummary & { projectId: string; workflowRunId: string }>): DeploymentDetail {
  const item = record(value, 'deployment');
  const releaseId = stringField(item, 'releaseId', 'deployment');
  const approved = releases.get(releaseId);
  if (!approved || approved.projectId !== project.id) throw new TypeError('deployment release does not belong to project');
  return {
    id: stringField(item, 'id', 'deployment'), project, status: status(item.status, 'deployment'), targetSha: approved.commitSha,
    previousSha: null, imageDigest: approved.imageDigest, failureCode: nullableString(item, 'failureCode', 'deployment'), recoveryResult: null,
    events: events(item.events),
  };
}

async function releaseList(client: ApiClient, projectId: string, cookie?: string) {
  const payload = record(await client.get<unknown>(`/api/v1/projects/${encodeURIComponent(projectId)}/releases`, cookie), 'release response');
  if (!Array.isArray(payload.items)) throw new TypeError('release response.items must be an array');
  return payload.items.map(release);
}

export class LivePageDataProvider {
  constructor(private readonly client: ApiClient, private readonly cookie?: string) {}

  async projects(): Promise<ProjectSummary[]> {
    const payload = await this.client.get<unknown>('/api/v1/projects', this.cookie);
    if (!Array.isArray(payload)) throw new TypeError('project list must be an array');
    return payload.map(projectSummary);
  }

  async project(id: string): Promise<ProjectDetail> {
    const base = projectSummary(await this.client.get<unknown>(`/api/v1/projects/${encodeURIComponent(id)}`, this.cookie));
    const releases = await releaseList(this.client, base.id, this.cookie);
    const history = record(await this.client.get<unknown>(`/api/v1/projects/${encodeURIComponent(base.id)}/deployments?limit=50`, this.cookie), 'deployment history');
    if (!Array.isArray(history.items)) throw new TypeError('deployment history.items must be an array');
    const details = await Promise.all(history.items.map((item) => this.client.get<unknown>(`/api/v1/deployments/${encodeURIComponent(stringField(record(item, 'deployment'), 'id', 'deployment'))}`, this.cookie)));
    const releaseMap = new Map(releases.map((item) => [item.id, item]));
    return { ...base, releases, deployments: details.map((item) => deployment(item, base, releaseMap)) };
  }

  async deployment(id: string): Promise<DeploymentDetail> {
    const raw = record(await this.client.get<unknown>(`/api/v1/deployments/${encodeURIComponent(id)}`, this.cookie), 'deployment');
    const projectId = stringField(raw, 'projectId', 'deployment');
    const project = projectSummary(await this.client.get<unknown>(`/api/v1/projects/${encodeURIComponent(projectId)}`, this.cookie));
    const releases = await releaseList(this.client, project.id, this.cookie);
    return deployment(raw, project, new Map(releases.map((item) => [item.id, item])));
  }

  async dashboard(): Promise<DashboardSummary> {
    const projects = await this.projects();
    return { projectCount: projects.length, healthyCount: projects.filter((item) => item.health === 'Healthy').length, unhealthyCount: projects.filter((item) => item.health === 'Unhealthy').length, latestAttempt: null, recentFailures: [] };
  }
}
