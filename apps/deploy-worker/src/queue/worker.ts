import type { ClaimedDeployment, JobRepository } from './job-repository.js';

export class Worker {
  constructor(private readonly jobs: JobRepository) {}

  // Task 9 claims work only. Deployment, route switching, and recovery begin
  // in later tasks after the runtime/probe/reconciliation boundaries exist.
  claimOne(projectId?: string): Promise<ClaimedDeployment | null> {
    return this.jobs.claimNext(projectId);
  }

  renewLease(id: string): Promise<boolean> {
    return this.jobs.renewLease(id);
  }

  recordEvent(id: string, code: string, message: string): Promise<void> {
    return this.jobs.recordEvent(id, code, message);
  }
}
