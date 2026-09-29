import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { DockerComposeAdapter, createRuntimeProject, renderProjectCompose, type Subprocess } from '../src/runtime/docker-compose-adapter.js';

const safeInput = {
  slug: 'student-api',
  repository: 'example/student-api',
  branch: 'main',
  imageNamespace: 'ghcr.io/example/student-api',
  domain: 'student-api.example.test',
  port: 3000,
  healthPath: '/health',
};
const safeDigest = `ghcr.io/example/student-api@sha256:${'a'.repeat(64)}`;

test('runtime input rejects foreign images, malformed slugs and ports, and shell-shaped values', () => {
  assert.throws(() => createRuntimeProject({ ...safeInput, imageNamespace: 'ghcr.io/other/student-api' }, 'ghcr.io/example/student-api'));
  assert.throws(() => createRuntimeProject({ ...safeInput, slug: 'student-api;id' }, 'ghcr.io/example/student-api'));
  assert.throws(() => createRuntimeProject({ ...safeInput, port: 0 }, 'ghcr.io/example/student-api'));
  assert.throws(() => createRuntimeProject({ ...safeInput, domain: 'student-api.example.test$(id)' }, 'ghcr.io/example/student-api'));
  assert.throws(() => renderProjectCompose(createRuntimeProject(safeInput, safeInput.imageNamespace), 'blue', `${safeDigest};id`));
});

test('fixed Compose rendering has resource limits and no host port, privileged mode, socket, or secret mount', async () => {
  const project = createRuntimeProject(safeInput, safeInput.imageNamespace);
  const rendered = renderProjectCompose(project, 'blue', safeDigest);
  await import('node:fs/promises').then(({ writeFile }) => writeFile('/tmp/devdeploy-test-project.yml', rendered, { mode: 0o600 }));
  assert.match(rendered, /cpus: '0\.50'/);
  assert.match(rendered, /memory: 256M/);
  assert.match(rendered, /driver: journald/);
  assert.match(rendered, /cap_drop:/);
  assert.doesNotMatch(rendered, /\bports:/);
  assert.doesNotMatch(rendered, /privileged:/);
  assert.doesNotMatch(rendered, /docker\.sock|\/var\/run\/docker/i);
  assert.doesNotMatch(rendered, /secret|\.env|platform/i);
});

test('adapter uses argument vectors without a shell and keeps only bounded redacted output', async () => {
  const calls: Array<{ command: string; arguments: string[]; shell: boolean | undefined }> = [];
  const subprocess: Subprocess = async (command, arguments_, options) => {
    calls.push({ command, arguments: arguments_, shell: options.shell });
    return { exitCode: 0, stdout: `Authorization: Bearer synthetic-token\n${'x'.repeat(10_000)}`, stderr: '' };
  };
  const directory = await mkdtemp(join(tmpdir(), 'devdeploy-worker-'));
  const adapter = new DockerComposeAdapter({ composeDirectory: directory, imageNamespace: safeInput.imageNamespace, subprocess });
  const project = createRuntimeProject(safeInput, safeInput.imageNamespace);

  await assert.rejects(adapter.pull(`ghcr.io/other/student-api@sha256:${'a'.repeat(64)}`));
  await adapter.pull(safeDigest);
  await adapter.start(project, 'blue', safeDigest);
  const generated = await readFile(join(directory, 'student-api-blue.yml'), 'utf8');

  assert.deepEqual(calls[0], { command: 'docker', arguments: ['pull', safeDigest], shell: false });
  assert.deepEqual(calls[1], { command: 'docker', arguments: ['compose', '-f', join(directory, 'student-api-blue.yml'), 'up', '-d'], shell: false });
  assert.match(generated, /student-api/);
  assert.doesNotMatch((await adapter.lastOutput()) ?? '', /synthetic-token/);
  assert.ok(((await adapter.lastOutput()) ?? '').length <= 8_192);
});
