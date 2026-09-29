import 'reflect-metadata';

import { Controller, Get, Module, ServiceUnavailableException, type DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { db } from '@devdeploy/db';

import { AdminGuard } from './auth/admin.guard.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthService, InMemoryAuthStore, PrismaAuthStore, type SeedAdministrator } from './auth/auth.service.js';
import { CsrfGuard } from './auth/csrf.guard.js';
import { loadGitHubServerConfiguration } from './github/github-http.client.js';
import { ProjectsController } from './projects/projects.controller.js';
import { InMemoryProjectStore, PrismaProjectStore, ProjectsService, type ProjectAllowlist } from './projects/projects.service.js';

const syntheticTestAllowlist: ProjectAllowlist = {
  repository: 'example/student-api',
  imageNamespace: 'ghcr.io/example/student-api',
};

@Controller('/api/v1/health')
class HealthController {
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    try {
      await db.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException();
    }
  }
}

@Module({})
class ApiModule {
  static register(authService: AuthService, projectsService: ProjectsService): DynamicModule {
    return {
      module: ApiModule,
      controllers: [AuthController, HealthController, ProjectsController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: ProjectsService, useValue: projectsService },
        AdminGuard,
        CsrfGuard,
      ],
    };
  }
}

export interface CreateApiAppOptions {
  administrator: SeedAdministrator;
}

export async function createApiApp(options: CreateApiAppOptions) {
  const store = await InMemoryAuthStore.withAdministrator(options.administrator);
  const app = await NestFactory.create(ApiModule.register(new AuthService(store), new ProjectsService(new InMemoryProjectStore(), syntheticTestAllowlist)), {
    logger: false,
  });
  await app.init();

  return {
    server: app.getHttpServer(),
    close: () => app.close(),
  };
}

export async function createProductionApiApp() {
  const github = loadGitHubServerConfiguration(process.env);
  const app = await NestFactory.create(ApiModule.register(
    new AuthService(new PrismaAuthStore()),
    new ProjectsService(new PrismaProjectStore(), { repository: github.repository, imageNamespace: github.imageNamespace }),
  ));
  await app.init();
  return app;
}
