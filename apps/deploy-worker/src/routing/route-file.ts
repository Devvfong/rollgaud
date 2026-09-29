import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ProjectConfig } from '@devdeploy/contracts';
import type { Slot } from '../runtime/docker-compose-adapter.js';

export interface RouteSnapshot { contents: string | null; }
export class RouteFile {
  constructor(private readonly directory: string) { this.directory = resolve(directory); }
  async activate(project: ProjectConfig, slot: Slot): Promise<RouteSnapshot> {
    if (!/^[a-z0-9.-]+$/i.test(project.domain) || !['blue', 'green'].includes(slot)) throw new TypeError('route input is malformed');
    const path = this.path(project); await mkdir(dirname(path), { recursive: true, mode: 0o750 });
    let contents: string | null = null; try { contents = await readFile(path, 'utf8'); } catch (error: unknown) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    const next = `http:\n  routers:\n    ${project.slug}:\n      rule: Host(\`${project.domain}\`)\n      service: ${project.slug}-${slot}\n      entryPoints: [websecure]\n      tls: {}\n  services:\n    ${project.slug}-${slot}:\n      loadBalancer:\n        servers:\n          - url: http://devdeploy-${project.slug}-${slot}:${project.port}\n`;
    await this.replace(path, next); return { contents };
  }
  async restore(project: ProjectConfig, snapshot: RouteSnapshot): Promise<void> { const path = this.path(project); if (snapshot.contents === null) { await this.replace(path, 'http:\n  routers: {}\n  services: {}\n'); return; } await this.replace(path, snapshot.contents); }
  private path(project: ProjectConfig): string { const path = resolve(this.directory, `${project.slug}.yml`); if (!path.startsWith(`${this.directory}/`)) throw new TypeError('route path is unsafe'); return path; }
  private async replace(path: string, contents: string): Promise<void> { const temp = `${path}.${randomUUID()}.tmp`; await writeFile(temp, contents, { encoding: 'utf8', mode: 0o640 }); await rename(temp, path); }
}
