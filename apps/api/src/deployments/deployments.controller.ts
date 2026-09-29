import { Body, ConflictException, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';

import { AdminGuard } from '../auth/admin.guard.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { QueueInsertionError } from '../releases/releases.service.js';
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

  @Post('projects/:id/deployments') @HttpCode(HttpStatus.ACCEPTED) @UseGuards(CsrfGuard)
  async deploy(@Param('id') projectId: string, @Body() input: { releaseId?: string }) { return this.queue(projectId, input, 'manual_redeploy'); }
  @Post('projects/:id/rollbacks') @HttpCode(HttpStatus.ACCEPTED) @UseGuards(CsrfGuard)
  async rollback(@Param('id') projectId: string, @Body() input: { releaseId?: string }) { return this.queue(projectId, input, 'manual_rollback'); }
  private async queue(projectId: string, input: { releaseId?: string }, trigger: 'manual_redeploy' | 'manual_rollback') { if (typeof input?.releaseId !== 'string') throw new ConflictException(); try { const deployment = await this.releaseAdmissions.queueManual(projectId, input.releaseId, trigger); return { deploymentId: deployment.id }; } catch (error) { if (error instanceof QueueInsertionError) throw new ConflictException(); throw error; } }
}
