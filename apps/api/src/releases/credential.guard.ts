import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { db } from '@devdeploy/db';

export interface StoredCredential {
  id: string;
  projectId: string;
  secretHash: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface CredentialStore {
  create(credential: StoredCredential): Promise<void>;
  findByHash(secretHash: string): Promise<StoredCredential | null>;
  findById(projectId: string, id: string): Promise<StoredCredential | null>;
  revoke(id: string): Promise<void>;
}

export class InMemoryCredentialStore implements CredentialStore {
  private readonly credentials = new Map<string, StoredCredential>();

  async create(credential: StoredCredential): Promise<void> {
    this.credentials.set(credential.id, credential);
  }

  async findByHash(secretHash: string): Promise<StoredCredential | null> {
    return [...this.credentials.values()].find((credential) => credential.secretHash === secretHash) ?? null;
  }

  async findById(projectId: string, id: string): Promise<StoredCredential | null> {
    const credential = this.credentials.get(id);
    return credential?.projectId === projectId ? credential : null;
  }

  async revoke(id: string): Promise<void> {
    const credential = this.credentials.get(id);
    if (credential) credential.revokedAt = new Date();
  }
}

export class PrismaCredentialStore implements CredentialStore {
  async create(credential: StoredCredential): Promise<void> {
    await db.apiCredential.create({ data: credential });
  }

  async findByHash(secretHash: string): Promise<StoredCredential | null> {
    return db.apiCredential.findFirst({ where: { secretHash } });
  }

  async findById(projectId: string, id: string): Promise<StoredCredential | null> {
    return db.apiCredential.findFirst({ where: { id, projectId } });
  }

  async revoke(id: string): Promise<void> {
    await db.apiCredential.update({ where: { id }, data: { revokedAt: new Date() } });
  }
}

export class CredentialService {
  constructor(private readonly store: CredentialStore, private readonly now: () => Date = () => new Date()) {}

  async create(projectId: string, expiresAtInput: unknown): Promise<{ id: string; token: string; expiresAt: Date | null }> {
    const expiresAt = parseExpiry(expiresAtInput, this.now());
    const token = randomBytes(32).toString('base64url');
    const credential = { id: randomUUID(), projectId, secretHash: hashCredential(token), expiresAt, revokedAt: null };
    await this.store.create(credential);
    return { id: credential.id, token, expiresAt };
  }

  async revoke(projectId: string, credentialId: string): Promise<boolean> {
    const credential = await this.store.findById(projectId, credentialId);
    if (!credential) return false;
    await this.store.revoke(credential.id);
    return true;
  }

  async authorize(projectId: string, authorization: string | undefined): Promise<boolean> {
    const match = /^Bearer ([A-Za-z0-9_-]{32,})$/.exec(authorization ?? '');
    if (!match) return false;
    const credential = await this.store.findByHash(hashCredential(match[1]));
    return credential !== null && credential.projectId === projectId && credential.revokedAt === null
      && (credential.expiresAt === null || credential.expiresAt > this.now());
  }
}

@Injectable()
export class WorkflowCredentialGuard implements CanActivate {
  constructor(private readonly credentials: CredentialService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ params: { id?: string }; headers: { authorization?: string } }>();
    if (!request.params.id || !(await this.credentials.authorize(request.params.id, request.headers.authorization))) {
      throw new UnauthorizedException();
    }
    return true;
  }
}

function hashCredential(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

function parseExpiry(value: unknown, now: Date): Date | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new TypeError('credential expiry must be an ISO timestamp');
  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.valueOf()) || expiresAt <= now) throw new TypeError('credential expiry must be in the future');
  return expiresAt;
}
