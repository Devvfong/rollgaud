import assert from 'node:assert/strict';
import test from 'node:test';

import JSZip from 'jszip';

import type { ProjectConfig, ReleaseIdentity } from '@devdeploy/contracts';
import { GitHubHttpClient, loadGitHubServerConfiguration } from '../src/github/github-http.client.js';
import { GitHubRunVerifier, type GitHubRunClient, VerificationError } from '../src/github/github-run-verifier.js';

const project: ProjectConfig = {
  slug: 'student-api', repository: 'example/student-api', branch: 'main',
  imageNamespace: 'ghcr.io/example/student-api', domain: 'student-api.example.test', port: 3000, healthPath: '/health',
};
const submitted: ReleaseIdentity = {
  repository: project.repository, branch: project.branch, workflowRunId: '42',
  commitSha: '0123456789abcdef0123456789abcdef01234567',
  imageDigest: 'ghcr.io/example/student-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
};

async function archive(manifest = JSON.stringify(submitted), fileName = 'release-manifest.json'): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(fileName, manifest);
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

async function archiveWithExtraFile(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('release-manifest.json', JSON.stringify(submitted));
  zip.file('unexpected.txt', 'ignored data is not allowed');
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

function client(overrides: Partial<GitHubRunClient> = {}): GitHubRunClient {
  return {
    getRun: async () => ({ id: 42, status: 'completed', conclusion: 'success', event: 'push', head_branch: 'main', head_sha: submitted.commitSha, path: '.github/workflows/ci.yml', repository: { full_name: project.repository } }),
    getArtifacts: async () => [{ id: 8, name: 'release-manifest', expired: false }],
    downloadArtifact: async () => archive(),
    ...overrides,
  };
}

test('verifies a completed successful CI run and matching manifest', async () => {
  const verified = await new GitHubRunVerifier(client(), { workflowPath: '.github/workflows/ci.yml' }).verify(project, submitted);
  assert.deepEqual(verified, { imageDigest: submitted.imageDigest, commitSha: submitted.commitSha, workflowRunId: submitted.workflowRunId, verifiedAt: verified.verifiedAt });
  assert.ok(verified.verifiedAt instanceof Date);
});

for (const [name, mutate] of [
  ['failed', (run: Record<string, unknown>) => { run.conclusion = 'failure'; }],
  ['incomplete', (run: Record<string, unknown>) => { run.status = 'in_progress'; }],
  ['non-push', (run: Record<string, unknown>) => { run.event = 'workflow_dispatch'; }],
  ['wrong branch', (run: Record<string, unknown>) => { run.head_branch = 'other'; }],
  ['wrong workflow', (run: Record<string, unknown>) => { run.path = '.github/workflows/other.yml'; }],
  ['wrong commit', (run: Record<string, unknown>) => { run.head_sha = 'f'.repeat(40); }],
  ['wrong repository', (run: Record<string, unknown>) => { run.repository = { full_name: 'other/repo' }; }],
] as const) {
  test(`rejects a ${name} run`, async () => {
    await assert.rejects(new GitHubRunVerifier(client({ getRun: async () => {
      const run: Record<string, unknown> = { id: 42, status: 'completed', conclusion: 'success', event: 'push', head_branch: 'main', head_sha: submitted.commitSha, path: '.github/workflows/ci.yml', repository: { full_name: project.repository } };
      mutate(run); return run as never;
    } }), { workflowPath: '.github/workflows/ci.yml' }).verify(project, submitted), VerificationError);
  });
}

test('rejects missing, expired, mismatched, unsafe, oversized, ambiguous, and timed-out artifacts', async () => {
  const cases: Array<Partial<GitHubRunClient>> = [
    { getArtifacts: async () => [] },
    { getArtifacts: async () => [{ id: 8, name: 'release-manifest', expired: true }] },
    { downloadArtifact: async () => archive(JSON.stringify({ ...submitted, imageDigest: `ghcr.io/example/student-api@sha256:${'b'.repeat(64)}` })) },
    { downloadArtifact: async () => archive(JSON.stringify(submitted), '../release-manifest.json') },
    { downloadArtifact: async () => archiveWithExtraFile() },
    { downloadArtifact: async () => archive(`{"repository":"${project.repository}","repository":"other/repo"}`) },
    { downloadArtifact: async () => Buffer.alloc(65 * 1024) },
    { downloadArtifact: async () => archive('x'.repeat(65 * 1024)) },
    { getRun: async () => { throw new DOMException('timeout', 'TimeoutError'); } },
  ];
  for (const override of cases) {
    await assert.rejects(new GitHubRunVerifier(client(override), { workflowPath: '.github/workflows/ci.yml' }).verify(project, submitted), VerificationError);
  }
});

test('uses the fixed GitHub API origin and encodes repository path segments', async () => {
  let requested: URL | undefined;
  const http = new GitHubHttpClient('synthetic-test-token', async (input) => {
    requested = new URL(String(input));
    return new Response(JSON.stringify({ id: 42 }), { status: 200, headers: { 'content-type': 'application/json' } });
  });

  await http.getRun('example/student-api', '42');
  assert.equal(requested?.origin, 'https://api.github.com');
  assert.equal(requested?.pathname, '/repos/example/student-api/actions/runs/42');
});

test('requires validated runtime repository, namespace, workflow, and read-token configuration', () => {
  assert.throws(() => loadGitHubServerConfiguration({ GITHUB_READ_TOKEN: 'synthetic-test-token' }), TypeError);
  assert.deepEqual(loadGitHubServerConfiguration({
    GITHUB_REPOSITORY: project.repository,
    GHCR_IMAGE_NAMESPACE: project.imageNamespace,
    GITHUB_WORKFLOW_PATH: '.github/workflows/ci.yml',
    GITHUB_READ_TOKEN: 'synthetic-test-token',
  }), {
    repository: project.repository,
    imageNamespace: project.imageNamespace,
    workflowPath: '.github/workflows/ci.yml',
    readToken: 'synthetic-test-token',
  });
});
