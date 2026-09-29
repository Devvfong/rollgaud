import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { parseProjectConfig, type ProjectConfig } from '@devdeploy/contracts';

import { projectComposeTemplate } from './project-template.js';

const digestPattern = /^ghcr\.io\/[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)+@sha256:[a-f0-9]{64}$/;
const slots = ['blue', 'green'] as const;
const outputLimit = 8_192;

export type Slot = (typeof slots)[number];
export type RuntimeProject = Readonly<ProjectConfig>;

export interface SubprocessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SubprocessOptions {
  cwd?: string;
  shell: false;
}

export type Subprocess = (command: string, arguments_: string[], options: SubprocessOptions) => Promise<SubprocessResult>;

export interface DockerComposeAdapterOptions {
  composeDirectory: string;
  imageNamespace: string;
  subprocess?: Subprocess;
}

export function createRuntimeProject(input: unknown, allowedImageNamespace: string): RuntimeProject {
  const project = parseProjectConfig(input);
  if (project.imageNamespace !== allowedImageNamespace) {
    throw new TypeError('project image namespace is not configured for this worker');
  }
  return Object.freeze(project);
}

export function renderProjectCompose(project: RuntimeProject, slot: Slot, digest: string): string {
  if (!slots.includes(slot)) throw new TypeError('deployment slot is malformed');
  if (!digestPattern.test(digest) || !digest.startsWith(`${project.imageNamespace}@sha256:`)) {
    throw new TypeError('image digest is outside the configured project namespace');
  }
  return projectComposeTemplate
    .replaceAll('__SLUG__', project.slug)
    .replaceAll('__SLOT__', slot)
    .replaceAll('__DIGEST__', digest)
    .replaceAll('__PORT__', String(project.port));
}

export class DockerComposeAdapter {
  private readonly composeDirectory: string;
  private readonly imageNamespace: string;
  private readonly subprocess: Subprocess;
  private output: string | undefined;

  constructor(options: DockerComposeAdapterOptions) {
    this.composeDirectory = resolve(options.composeDirectory);
    if (!/^ghcr\.io\/[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)+$/.test(options.imageNamespace)) {
      throw new TypeError('configured image namespace is malformed');
    }
    this.imageNamespace = options.imageNamespace;
    this.subprocess = options.subprocess ?? spawnSubprocess;
  }

  async pull(digest: string): Promise<void> {
    if (!digestPattern.test(digest) || !digest.startsWith(`${this.imageNamespace}@sha256:`)) {
      throw new TypeError('image digest is outside the configured worker namespace');
    }
    await this.run('docker', ['pull', digest]);
  }

  async start(project: RuntimeProject, slot: Slot, digest: string): Promise<void> {
    if (project.imageNamespace !== this.imageNamespace) throw new TypeError('project image namespace is not configured for this worker');
    const composePath = this.composePath(project, slot);
    await mkdir(this.composeDirectory, { recursive: true, mode: 0o700 });
    await writeFile(composePath, renderProjectCompose(project, slot, digest), { encoding: 'utf8', mode: 0o600 });
    await this.run('docker', ['compose', '-f', composePath, 'up', '-d']);
  }

  async stop(project: RuntimeProject, slot: Slot): Promise<void> {
    await this.run('docker', ['compose', '-f', this.composePath(project, slot), 'down']);
  }

  async inspect(project: RuntimeProject, slot: Slot): Promise<void> {
    await this.run('docker', ['compose', '-f', this.composePath(project, slot), 'ps', '--format', 'json']);
  }

  lastOutput(): string | undefined {
    return this.output;
  }

  private composePath(project: RuntimeProject, slot: Slot): string {
    if (!slots.includes(slot)) throw new TypeError('deployment slot is malformed');
    const path = resolve(this.composeDirectory, `${project.slug}-${slot}.yml`);
    if (!path.startsWith(`${this.composeDirectory}/`)) throw new TypeError('generated Compose path is unsafe');
    return path;
  }

  private async run(command: string, arguments_: string[]): Promise<void> {
    const result = await this.subprocess(command, arguments_, { shell: false });
    this.output = redactAndBound(`${result.stdout}\n${result.stderr}`);
    if (result.exitCode !== 0) throw new Error(`runtime command failed with exit code ${result.exitCode}`);
  }
}

const spawnSubprocess: Subprocess = (command, arguments_, options) => new Promise((resolveResult, reject) => {
  const child = spawn(command, arguments_, { cwd: options.cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => { stdout = appendBounded(stdout, chunk.toString()); });
  child.stderr.on('data', (chunk: Buffer) => { stderr = appendBounded(stderr, chunk.toString()); });
  child.once('error', reject);
  child.once('close', (exitCode) => resolveResult({ exitCode: exitCode ?? 1, stdout, stderr }));
});

function appendBounded(output: string, chunk: string): string {
  return `${output}${chunk}`.slice(-outputLimit);
}

function redactAndBound(output: string): string {
  return output
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/)[^\s/@]+@/gi, '$1[REDACTED]@')
    .slice(-outputLimit);
}
