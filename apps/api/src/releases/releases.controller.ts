import { BadRequestException, Body, ConflictException, Controller, HttpCode, HttpStatus, Param, Post, UnprocessableEntityException, UseGuards } from '@nestjs/common';

import { WorkflowCredentialGuard } from './credential.guard.js';
import { ReleaseAdmissionService, ReleaseVerificationError, StaleReleaseError } from './releases.service.js';

@Controller('/api/v1/ci/projects')
export class ReleasesController {
  constructor(private readonly releases: ReleaseAdmissionService) {}

  @Post(':id/releases')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(WorkflowCredentialGuard)
  async admit(@Param('id') projectId: string, @Body() input: unknown) {
    try {
      const admitted = await this.releases.admit(projectId, input);
      return { releaseId: admitted.release.id, deploymentId: admitted.deployment.id };
    } catch (error) {
      if (error instanceof StaleReleaseError) throw new ConflictException('stale release');
      if (error instanceof ReleaseVerificationError) throw new UnprocessableEntityException('release was not verified');
      if (error instanceof TypeError) throw new BadRequestException();
      throw error;
    }
  }
}
