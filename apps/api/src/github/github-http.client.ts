export interface GitHubWorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  event: string;
  head_branch: string;
  head_sha: string;
  path: string;
  repository: { full_name: string };
}

export interface GitHubArtifact {
  id: number;
  name: string;
  expired: boolean;
}

export interface GitHubRunClient {
  getRun(repository: string, runId: string): Promise<GitHubWorkflowRun>;
  getArtifacts(repository: string, runId: string): Promise<GitHubArtifact[]>;
  downloadArtifact(repository: string, artifactId: number): Promise<Buffer>;
}

export interface GitHubServerConfiguration {
  repository: string;
  imageNamespace: string;
  workflowPath: string;
  readToken: string;
}

const GITHUB_API_ORIGIN = 'https://api.github.com';
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_ARTIFACT_BYTES = 64 * 1024;

export function loadGitHubServerConfiguration(environment: NodeJS.ProcessEnv): GitHubServerConfiguration {
  const repository = environment.GITHUB_REPOSITORY ?? '';
  const imageNamespace = environment.GHCR_IMAGE_NAMESPACE ?? '';
  const workflowPath = environment.GITHUB_WORKFLOW_PATH ?? '';
  const readToken = environment.GITHUB_READ_TOKEN ?? '';
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
    || !/^ghcr\.io\/[a-z0-9][a-z0-9._/-]*$/.test(imageNamespace)
    || !/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/.test(workflowPath)
    || readToken.trim().length === 0) {
    throw new TypeError('GitHub repository, namespace, workflow, and read token must be configured at runtime');
  }
  return { repository, imageNamespace, workflowPath, readToken };
}

export class GitHubHttpError extends Error {
  constructor(readonly reason: 'github-timeout' | 'github-unavailable' | 'github-invalid-response') {
    super(reason);
  }
}

export class GitHubHttpClient implements GitHubRunClient {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {
    if (token.trim().length === 0) throw new TypeError('GitHub token must be configured at runtime');
  }

  async getRun(repository: string, runId: string): Promise<GitHubWorkflowRun> {
    return this.json(this.repositoryPath(repository, `/actions/runs/${this.segment(runId)}`));
  }

  async getArtifacts(repository: string, runId: string): Promise<GitHubArtifact[]> {
    const response = await this.json<{ artifacts?: unknown }>(this.repositoryPath(repository, `/actions/runs/${this.segment(runId)}/artifacts?per_page=100`));
    if (!Array.isArray(response.artifacts)) throw new GitHubHttpError('github-invalid-response');
    if (!response.artifacts.every(isGitHubArtifact)) throw new GitHubHttpError('github-invalid-response');
    return response.artifacts;
  }

  async downloadArtifact(repository: string, artifactId: number): Promise<Buffer> {
    return this.buffer(this.repositoryPath(repository, `/actions/artifacts/${this.segment(String(artifactId))}/zip`));
  }

  private repositoryPath(repository: string, suffix: string): string {
    const [owner, name, ...rest] = repository.split('/');
    if (!owner || !name || rest.length > 0) throw new GitHubHttpError('github-invalid-response');
    return `/repos/${this.segment(owner)}/${this.segment(name)}${suffix}`;
  }

  private segment(value: string): string {
    if (value.length === 0 || value.length > 200) throw new GitHubHttpError('github-invalid-response');
    return encodeURIComponent(value);
  }

  private async json<T>(path: string): Promise<T> {
    const response = await this.request(path, 'application/vnd.github+json');
    const body = await this.read(response, MAX_ARTIFACT_BYTES);
    try {
      return JSON.parse(body.toString('utf8')) as T;
    } catch {
      throw new GitHubHttpError('github-invalid-response');
    }
  }

  private async buffer(path: string): Promise<Buffer> {
    return this.read(await this.request(path, 'application/vnd.github+json'), MAX_ARTIFACT_BYTES);
  }

  private async request(path: string, accept: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(new URL(path, GITHUB_API_ORIGIN), {
        headers: { accept, authorization: `Bearer ${this.token}`, 'user-agent': 'devdeploy' },
        signal: controller.signal,
      });
      if (!response.ok) throw new GitHubHttpError('github-unavailable');
      return response;
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'TimeoutError')) {
        throw new GitHubHttpError('github-timeout');
      }
      if (error instanceof GitHubHttpError) throw error;
      throw new GitHubHttpError('github-unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async read(response: Response, limit: number): Promise<Buffer> {
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > limit) throw new GitHubHttpError('github-invalid-response');
    const reader = response.body?.getReader();
    if (!reader) throw new GitHubHttpError('github-invalid-response');
    const chunks: Uint8Array[] = [];
    let size = 0;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new GitHubHttpError('github-timeout')), REQUEST_TIMEOUT_MS);
    });
    try {
      return await Promise.race([timeout, (async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > limit) throw new GitHubHttpError('github-invalid-response');
          chunks.push(value);
        }
        return Buffer.concat(chunks);
      })()]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reader.releaseLock();
    }
  }
}

function isGitHubArtifact(value: unknown): value is GitHubArtifact {
  return typeof value === 'object' && value !== null
    && typeof (value as GitHubArtifact).id === 'number' && Number.isSafeInteger((value as GitHubArtifact).id)
    && (value as GitHubArtifact).id > 0
    && typeof (value as GitHubArtifact).name === 'string'
    && typeof (value as GitHubArtifact).expired === 'boolean';
}
