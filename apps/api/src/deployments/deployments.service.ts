import { NotFoundException } from '@nestjs/common';

import { ReleaseAdmissionService, type StoredDeployment, type StoredDeploymentEvent } from '../releases/releases.service.js';

export class DeploymentsService {
  constructor(private readonly releases: ReleaseAdmissionService) {}

  async history(projectId: string, cursor: string | undefined, limitInput: string | undefined) {
    const limit = parseLimit(limitInput);
    return this.releases.listDeployments(projectId, cursor, limit);
  }

  async detail(id: string): Promise<StoredDeployment & { events: StoredDeploymentEvent[] }> {
    const deployment = await this.releases.deployment(id);
    if (!deployment) throw new NotFoundException();
    return deployment;
  }
}

function parseLimit(value: string | undefined): number {
  if (value === undefined) return 20;
  if (!/^[1-9][0-9]*$/.test(value)) return 20;
  return Math.min(Number(value), 100);
}
