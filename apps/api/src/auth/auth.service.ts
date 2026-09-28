import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

import { db } from '@devdeploy/db';

const SESSION_TTL_MS = 30 * 60 * 1000;

function deriveKey(password: string, salt: Buffer, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, length, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(Buffer.from(derivedKey));
    });
  });
}

export interface SeedAdministrator {
  id: string;
  email: string;
  password: string;
  disabled?: boolean;
}

export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  disabled: boolean;
}

export interface StoredSession {
  id: string;
  userId: string | null;
  tokenHash: string;
  csrfHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface AuthStore {
  findUserByEmail(email: string): Promise<StoredUser | null>;
  findUserById(id: string): Promise<StoredUser | null>;
  createSession(session: StoredSession): Promise<void>;
  findSession(tokenHash: string): Promise<StoredSession | null>;
  updateCsrfHash(id: string, csrfHash: string): Promise<void>;
  revokeSession(id: string): Promise<void>;
}

export class InMemoryAuthStore implements AuthStore {
  private readonly users = new Map<string, StoredUser>();
  private readonly sessions = new Map<string, StoredSession>();

  static async withAdministrator(administrator: SeedAdministrator): Promise<InMemoryAuthStore> {
    const store = new InMemoryAuthStore();
    store.users.set(administrator.email.toLowerCase(), {
      id: administrator.id,
      email: administrator.email,
      passwordHash: await hashPassword(administrator.password),
      disabled: administrator.disabled ?? false,
    });
    return store;
  }

  async findUserByEmail(email: string): Promise<StoredUser | null> {
    return this.users.get(email.toLowerCase()) ?? null;
  }

  async findUserById(id: string): Promise<StoredUser | null> {
    for (const user of this.users.values()) {
      if (user.id === id) return user;
    }
    return null;
  }

  async createSession(session: StoredSession): Promise<void> {
    this.sessions.set(session.tokenHash, session);
  }

  async findSession(tokenHash: string): Promise<StoredSession | null> {
    return this.sessions.get(tokenHash) ?? null;
  }

  async updateCsrfHash(id: string, csrfHash: string): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.id === id) session.csrfHash = csrfHash;
    }
  }

  async revokeSession(id: string): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.id === id) session.revokedAt = new Date();
    }
  }
}

export class PrismaAuthStore implements AuthStore {
  async findUserByEmail(email: string): Promise<StoredUser | null> {
    const user = await db.user.findUnique({ where: { email } });
    return user && { id: user.id, email: user.email, passwordHash: user.passwordHash, disabled: user.disabledAt !== null };
  }

  async findUserById(id: string): Promise<StoredUser | null> {
    const user = await db.user.findUnique({ where: { id } });
    return user && { id: user.id, email: user.email, passwordHash: user.passwordHash, disabled: user.disabledAt !== null };
  }

  async createSession(session: StoredSession): Promise<void> {
    await db.adminSession.create({ data: session });
  }

  async findSession(tokenHash: string): Promise<StoredSession | null> {
    return db.adminSession.findUnique({ where: { tokenHash } });
  }

  async updateCsrfHash(id: string, csrfHash: string): Promise<void> {
    await db.adminSession.update({ where: { id }, data: { csrfHash } });
  }

  async revokeSession(id: string): Promise<void> {
    await db.adminSession.update({ where: { id }, data: { revokedAt: new Date() } });
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, encodedSalt, encodedHash] = stored.split('$');
  if (algorithm !== 'scrypt' || !encodedSalt || !encodedHash) return false;
  const expected = Buffer.from(encodedHash, 'base64url');
  const actual = await deriveKey(password, Buffer.from(encodedSalt, 'base64url'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function hashOpaque(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function randomOpaque(): string {
  return randomBytes(32).toString('base64url');
}

export class AuthService {
  private readonly failedLogins = new Map<string, number>();

  constructor(private readonly store: AuthStore) {}

  async issueCsrf(token: string | undefined): Promise<{ token: string; csrfToken: string }> {
    const existing = token ? await this.activeSession(token) : null;
    if (!existing) return this.createSession(null);
    const csrfToken = randomOpaque();
    await this.store.updateCsrfHash(existing.id, hashOpaque(csrfToken));
    return { token: token!, csrfToken };
  }

  async login(token: string | undefined, csrfToken: string | undefined, email: unknown, password: unknown) {
    const session = await this.requireCsrf(token, csrfToken);
    if (typeof email !== 'string' || typeof password !== 'string') return null;
    const key = email.toLowerCase();
    if ((this.failedLogins.get(key) ?? 0) >= 4) return 'limited' as const;
    const user = await this.store.findUserByEmail(key);
    if (!user || user.disabled || !(await verifyPassword(password, user.passwordHash))) {
      this.failedLogins.set(key, (this.failedLogins.get(key) ?? 0) + 1);
      return null;
    }
    this.failedLogins.delete(key);
    await this.store.revokeSession(session.id);
    const authenticated = await this.createSession(user.id);
    return { ...authenticated, user: { id: user.id, email: user.email } };
  }

  async authenticatedUser(token: string | undefined): Promise<{ id: string; email: string } | null> {
    const session = token ? await this.activeSession(token) : null;
    if (!session?.userId) return null;
    const user = await this.findUserById(session.userId);
    return user && !user.disabled ? { id: user.id, email: user.email } : null;
  }

  async logout(token: string | undefined, csrfToken: string | undefined): Promise<void> {
    const session = await this.requireCsrf(token, csrfToken);
    await this.store.revokeSession(session.id);
  }

  async requireCsrf(token: string | undefined, csrfToken: string | undefined): Promise<StoredSession> {
    const session = token ? await this.activeSession(token) : null;
    if (!session || !csrfToken || !timingSafeEqual(Buffer.from(session.csrfHash), Buffer.from(hashOpaque(csrfToken)))) {
      throw new Error('csrf');
    }
    return session;
  }

  private async createSession(userId: string | null): Promise<{ token: string; csrfToken: string }> {
    const token = randomOpaque();
    const csrfToken = randomOpaque();
    await this.store.createSession({
      id: randomOpaque(),
      userId,
      tokenHash: hashOpaque(token),
      csrfHash: hashOpaque(csrfToken),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      revokedAt: null,
    });
    return { token, csrfToken };
  }

  private async activeSession(token: string): Promise<StoredSession | null> {
    const session = await this.store.findSession(hashOpaque(token));
    return session && !session.revokedAt && session.expiresAt > new Date() ? session : null;
  }

  private async findUserById(id: string): Promise<StoredUser | null> {
    return this.store.findUserById(id);
  }
}
