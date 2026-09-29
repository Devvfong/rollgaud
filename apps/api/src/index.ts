import 'reflect-metadata';

import { Controller, Get, Header, Module, ServiceUnavailableException, type DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { db } from '@devdeploy/db';

import { AdminGuard } from './auth/admin.guard.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthService, InMemoryAuthStore, PrismaAuthStore, type SeedAdministrator } from './auth/auth.service.js';
import { CsrfGuard } from './auth/csrf.guard.js';
import { DeploymentsController } from './deployments/deployments.controller.js';
import { DeploymentsService } from './deployments/deployments.service.js';
import { GitHubHttpClient, loadGitHubServerConfiguration } from './github/github-http.client.js';
import { GitHubRunVerifier } from './github/github-run-verifier.js';
import { ProjectsController } from './projects/projects.controller.js';
import { InMemoryProjectStore, PrismaProjectStore, ProjectsService, type ProjectAllowlist } from './projects/projects.service.js';
import { CredentialService, InMemoryCredentialStore, PrismaCredentialStore, WorkflowCredentialGuard } from './releases/credential.guard.js';
import { CredentialsController } from './releases/credentials.controller.js';
import { ReleasesController } from './releases/releases.controller.js';
import { InMemoryReleaseStore, PrismaReleaseStore, ReleaseAdmissionService, type ReleaseVerifier } from './releases/releases.service.js';
import { HttpMetrics } from './metrics.js';

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

@Controller()
class MetricsController {
  constructor(private readonly metrics: HttpMetrics) {}

  @Get('metrics')
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  metricsText() {
    return this.metrics.render();
  }
}

@Module({})
class ApiModule {
  static register(authService: AuthService, projectsService: ProjectsService, credentials: CredentialService, releases: ReleaseAdmissionService, metrics: HttpMetrics): DynamicModule {
    return {
      module: ApiModule,
      controllers: [AuthController, HealthController, MetricsController, ProjectsController, CredentialsController, ReleasesController, DeploymentsController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: ProjectsService, useValue: projectsService },
        { provide: CredentialService, useValue: credentials },
        { provide: ReleaseAdmissionService, useValue: releases },
        { provide: HttpMetrics, useValue: metrics },
        { provide: DeploymentsService, useValue: new DeploymentsService(releases) },
        AdminGuard,
        CsrfGuard,
        WorkflowCredentialGuard,
      ],
    };
  }
}

export interface CreateApiAppOptions {
  administrator: SeedAdministrator;
  verifier?: ReleaseVerifier;
  now?: () => Date;
  failQueueInsert?: boolean;
}

export async function createApiApp(options: CreateApiAppOptions) {
  const store = await InMemoryAuthStore.withAdministrator(options.administrator);
  const projects = new ProjectsService(new InMemoryProjectStore(), syntheticTestAllowlist);
  const releaseStore = new InMemoryReleaseStore({ failQueueInsert: options.failQueueInsert, now: options.now });
  const releases = new ReleaseAdmissionService(releaseStore, options.verifier ?? { verify: async () => { throw new Error('GitHub verifier is not configured'); } }, (id) => projects.findById(id));
  const metrics = new HttpMetrics('api');
  const app = await NestFactory.create(ApiModule.register(new AuthService(store), projects, new CredentialService(new InMemoryCredentialStore(), options.now), releases, metrics), {
    logger: false,
  });
  app.use(metrics.middleware());
  await app.init();

  return {
    server: app.getHttpServer(),
    close: () => app.close(),
    releaseService: releases,
  };
}

export async function createProductionApiApp() {
  const github = loadGitHubServerConfiguration(process.env);
  const projects = new ProjectsService(new PrismaProjectStore(), { repository: github.repository, imageNamespace: github.imageNamespace });
  const releases = new ReleaseAdmissionService(
    new PrismaReleaseStore(),
    new GitHubRunVerifier(new GitHubHttpClient(github.readToken), { workflowPath: github.workflowPath }),
    (id) => projects.findById(id),
  );
  const metrics = new HttpMetrics('api');
  const app = await NestFactory.create(ApiModule.register(
    new AuthService(new PrismaAuthStore()),
    projects,
    new CredentialService(new PrismaCredentialStore()),
    releases,
    metrics,
  ));
  app.use(metrics.middleware());
  await app.init();
  return app;
}
