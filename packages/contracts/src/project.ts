export interface ProjectConfig {
  slug: string;
  repository: string;
  branch: string;
  imageNamespace: string;
  domain: string;
  port: number;
  healthPath: string;
}

const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const branchPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;
const imageNamespacePattern = /^ghcr\.io\/[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)+$/;
const domainPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const healthPathPattern = /^\/(?:[A-Za-z0-9._~-]+\/?)*$/;

function recordFrom(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new TypeError('project configuration must be an object');
  }

  return input as Record<string, unknown>;
}

function requiredString(record: Record<string, unknown>, field: Exclude<keyof ProjectConfig, 'port'>): string {
  const value = record[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`project configuration ${field} must be a non-empty string`);
  }

  return value;
}

export function parseProjectConfig(input: unknown): ProjectConfig {
  const record = recordFrom(input);
  const slug = requiredString(record, 'slug');
  const repository = requiredString(record, 'repository');
  const branch = requiredString(record, 'branch');
  const imageNamespace = requiredString(record, 'imageNamespace');
  const domain = requiredString(record, 'domain');
  const healthPath = requiredString(record, 'healthPath');
  const port = record.port;

  if (!slugPattern.test(slug)) {
    throw new TypeError('project configuration slug is malformed');
  }
  if (!repositoryPattern.test(repository)) {
    throw new TypeError('project configuration repository must be owner/repository');
  }
  if (!branchPattern.test(branch) || branch.includes('..')) {
    throw new TypeError('project configuration branch is malformed');
  }
  if (!imageNamespacePattern.test(imageNamespace)) {
    throw new TypeError('project configuration imageNamespace must be a GHCR namespace');
  }
  if (!domainPattern.test(domain)) {
    throw new TypeError('project configuration domain is malformed');
  }
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TypeError('project configuration port must be an integer from 1 to 65535');
  }
  if (!healthPathPattern.test(healthPath) || healthPath.includes('..')) {
    throw new TypeError('project configuration healthPath is malformed');
  }

  return { slug, repository, branch, imageNamespace, domain, port, healthPath };
}
