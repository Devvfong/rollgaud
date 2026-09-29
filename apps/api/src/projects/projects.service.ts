import { randomUUID } from 'node:crypto';

import { parseProjectConfig, type ProjectConfig } from '@devdeploy/contracts';
import { db } from '@devdeploy/db';

export interface ProjectRecord extends ProjectConfig {
  id: string;
  name: string;
  status: 'active' | 'disabled';
}

export interface ProjectStore {
  create(project: ProjectRecord): Promise<ProjectRecord>;
  list(): Promise<ProjectRecord[]>;
  findById(id: string): Promise<ProjectRecord | null>;
}

export interface ProjectAllowlist {
  repository: string;
  imageNamespace: string;
}

export class DuplicateProjectError extends Error {}

export class InMemoryProjectStore implements ProjectStore {
  private readonly projects = new Map<string, ProjectRecord>();

  async create(project: ProjectRecord): Promise<ProjectRecord> {
    if ([...this.projects.values()].some((existing) => existing.slug === project.slug || existing.domain === project.domain)) {
      throw new DuplicateProjectError();
    }
    this.projects.set(project.id, project);
    return project;
  }

  async list(): Promise<ProjectRecord[]> {
    return [...this.projects.values()];
  }

  async findById(id: string): Promise<ProjectRecord | null> {
    return this.projects.get(id) ?? null;
  }
}

export class PrismaProjectStore implements ProjectStore {
  async create(project: ProjectRecord): Promise<ProjectRecord> {
    try {
      return await db.project.create({ data: project });
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') throw new DuplicateProjectError();
      throw error;
    }
  }

  async list(): Promise<ProjectRecord[]> {
    return db.project.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async findById(id: string): Promise<ProjectRecord | null> {
    return db.project.findUnique({ where: { id } });
  }
}

export class ProjectsService {
  constructor(private readonly store: ProjectStore, private readonly allowlist: ProjectAllowlist) {}

  async create(input: unknown): Promise<ProjectRecord> {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new TypeError('project configuration must be an object');
    }
    const allowedFields = new Set(['slug', 'name', 'repository', 'branch', 'imageNamespace', 'domain', 'port', 'healthPath']);
    if (Object.keys(input).some((field) => !allowedFields.has(field))) {
      throw new TypeError('project configuration contains unsupported fields');
    }
    const config = parseProjectConfig(input);
    const nameValue = (input as Record<string, unknown>).name;
    const name = typeof nameValue === 'string' ? nameValue : '';
    if (!name || config.repository !== this.allowlist.repository || config.imageNamespace !== this.allowlist.imageNamespace) {
      throw new TypeError('project configuration is not allowed');
    }
    return this.store.create({ id: randomUUID(), name, status: 'active', ...config });
  }

  list(): Promise<ProjectRecord[]> {
    return this.store.list();
  }

  findById(id: string): Promise<ProjectRecord | null> {
    return this.store.findById(id);
  }
}
