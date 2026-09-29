import type { ProjectConfig, ReleaseIdentity } from '@devdeploy/contracts';

import { GitHubHttpError, type GitHubRunClient } from './github-http.client.js';
import { ManifestError, parseReleaseManifestArchive } from './manifest-parser.js';

export { type GitHubRunClient } from './github-http.client.js';

export interface VerifiedRelease {
  workflowRunId: string;
  commitSha: string;
  imageDigest: string;
  verifiedAt: Date;
}

export class VerificationError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

export class GitHubRunVerifier {
  constructor(
    private readonly client: GitHubRunClient,
    config: { workflowPath: string },
  ) {
    if (!/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/.test(config.workflowPath)) {
      throw new TypeError('GitHub workflow path must be validated server configuration');
    }
    this.workflowPath = config.workflowPath;
  }

  private readonly workflowPath: string;

  async verify(project: ProjectConfig, submitted: ReleaseIdentity): Promise<VerifiedRelease> {
    try {
      this.requireSubmissionMatchesProject(project, submitted);
      const run = await this.client.getRun(project.repository, submitted.workflowRunId);
      if (String(run.id) !== submitted.workflowRunId || run.status !== 'completed' || run.conclusion !== 'success'
        || run.event !== 'push' || run.head_branch !== project.branch || run.head_sha !== submitted.commitSha
        || run.path !== this.workflowPath || run.repository.full_name !== project.repository) {
        throw new VerificationError('unverified-run');
      }
      const artifacts = await this.client.getArtifacts(project.repository, submitted.workflowRunId);
      const candidates = artifacts.filter((artifact) => artifact.name === 'release-manifest');
      if (candidates.length !== 1 || candidates[0].expired) throw new VerificationError('missing-manifest');
      const manifest = await parseReleaseManifestArchive(await this.client.downloadArtifact(project.repository, candidates[0].id));
      if (manifest.repository !== submitted.repository || manifest.branch !== submitted.branch
        || manifest.workflowRunId !== submitted.workflowRunId || manifest.commitSha !== submitted.commitSha
        || manifest.imageDigest !== submitted.imageDigest) {
        throw new VerificationError('manifest-mismatch');
      }
      return { workflowRunId: submitted.workflowRunId, commitSha: submitted.commitSha, imageDigest: submitted.imageDigest, verifiedAt: new Date() };
    } catch (error) {
      if (error instanceof VerificationError) throw error;
      if (error instanceof ManifestError || error instanceof GitHubHttpError) throw new VerificationError(error.reason);
      throw new VerificationError('verification-unavailable');
    }
  }

  private requireSubmissionMatchesProject(project: ProjectConfig, submitted: ReleaseIdentity): void {
    if (submitted.repository !== project.repository || submitted.branch !== project.branch
      || !submitted.imageDigest.startsWith(`${project.imageNamespace}@`)) {
      throw new VerificationError('submission-not-allowlisted');
    }
  }
}
