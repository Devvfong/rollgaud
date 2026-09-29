import { BadRequestException, Body, Controller, HttpCode, HttpStatus, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';

import { AdminGuard } from '../auth/admin.guard.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { ProjectsService } from '../projects/projects.service.js';
import { CredentialService } from './credential.guard.js';

@Controller('/api/v1/projects')
@UseGuards(AdminGuard)
export class CredentialsController {
  constructor(private readonly credentials: CredentialService, private readonly projects: ProjectsService) {}

  @Post(':id/credentials')
  @UseGuards(CsrfGuard)
  async create(@Param('id') projectId: string, @Body() body: { expiresAt?: unknown }) {
    if (!(await this.projects.findById(projectId))) throw new NotFoundException();
    try {
      return await this.credentials.create(projectId, body?.expiresAt);
    } catch (error) {
      if (error instanceof TypeError) throw new BadRequestException();
      throw error;
    }
  }

  @Post(':projectId/credentials/:credentialId/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  async revoke(@Param('projectId') projectId: string, @Param('credentialId') credentialId: string) {
    if (!(await this.credentials.revoke(projectId, credentialId))) throw new NotFoundException();
  }
}
