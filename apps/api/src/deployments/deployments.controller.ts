import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';

import { AdminGuard } from '../auth/admin.guard.js';
import { ReleaseAdmissionService } from '../releases/releases.service.js';
import { DeploymentsService } from './deployments.service.js';

@Controller('/api/v1')
@UseGuards(AdminGuard)
export class DeploymentsController {
  constructor(private readonly deployments: DeploymentsService, private readonly releaseAdmissions: ReleaseAdmissionService) {}

  @Get('projects/:id/releases')
  async releases(@Param('id') projectId: string) {
    return { items: await this.releaseAdmissions.listReleases(projectId) };
  }

  @Get('projects/:id/deployments')
  history(@Param('id') projectId: string, @Query('cursor') cursor: string | undefined, @Query('limit') limit: string | undefined) {
    return this.deployments.history(projectId, cursor, limit);
  }

  @Get('deployments/:id')
  detail(@Param('id') id: string) {
    return this.deployments.detail(id);
  }
}
