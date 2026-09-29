import { PrismaJobRepository } from './queue/job-repository.js';
import { Worker } from './queue/worker.js';

async function main(): Promise<void> {
  const worker = new Worker(new PrismaJobRepository());
  await worker.claimOne();
}

void main().catch(() => {
  // Do not include database URLs, command output, or process environment in
  // worker startup failures; the service manager captures this fixed message.
  console.error('DevDeploy worker could not claim a deployment.');
  process.exitCode = 1;
});
