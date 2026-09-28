export interface ReleaseIdentity {
  repository: string;
  branch: string;
  commitSha: string;
  workflowRunId: string;
  imageDigest: string;
}

const commitShaPattern = /^[a-f0-9]{40}$/i;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const branchPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;
const workflowRunIdPattern = /^[1-9][0-9]*$/;
const imageDigestPattern = /^ghcr\.io\/[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)+@sha256:[a-f0-9]{64}$/;

function recordFrom(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new TypeError('release identity must be an object');
  }

  return input as Record<string, unknown>;
}

function requiredString(record: Record<string, unknown>, field: keyof ReleaseIdentity): string {
  const value = record[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`release identity ${field} must be a non-empty string`);
  }

  return value;
}

export function parseReleaseIdentity(input: unknown): ReleaseIdentity {
  const record = recordFrom(input);
  const repository = requiredString(record, 'repository');
  const branch = requiredString(record, 'branch');
  const commitSha = requiredString(record, 'commitSha');
  const workflowRunId = requiredString(record, 'workflowRunId');
  const imageDigest = requiredString(record, 'imageDigest');

  if (!repositoryPattern.test(repository)) {
    throw new TypeError('release identity repository must be owner/repository');
  }
  if (!branchPattern.test(branch) || branch.includes('..')) {
    throw new TypeError('release identity branch is malformed');
  }
  if (!commitShaPattern.test(commitSha)) {
    throw new TypeError('release identity commitSha must be 40 hexadecimal characters');
  }
  if (!workflowRunIdPattern.test(workflowRunId)) {
    throw new TypeError('release identity workflowRunId must be a positive integer string');
  }
  if (!imageDigestPattern.test(imageDigest)) {
    throw new TypeError('release identity imageDigest must be an immutable GHCR SHA-256 digest');
  }

  return { repository, branch, commitSha, workflowRunId, imageDigest };
}
