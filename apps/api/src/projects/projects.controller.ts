import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post, UseGuards, BadRequestException, ConflictException } from '@nestjs/common';

import { AdminGuard } from '../auth/admin.guard.js';
import { DuplicateProjectError, ProjectsService } from './projects.service.js';

@Controller('/api/v1/projects')
@UseGuards(AdminGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() input: unknown) {
    try {
      return await this.projects.create(input);
    } catch (error: unknown) {
      if (error instanceof DuplicateProjectError) throw new ConflictException();
      throw new BadRequestException();
    }
  }

  @Get()
  list() {
    return this.projects.list();
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const project = await this.projects.findById(id);
    if (!project) throw new NotFoundException();
    return project;
  }
}
