import type { AuditEntry, AuditWriter } from "../domain/audit.js";
import type {
  ChatSession,
  ChatSessionWithOwner,
  CreateChatSessionInput,
} from "../domain/entities/chat-session.js";
import type {
  CompanyUser,
  CreateCompanyUserInput,
  UpdateCompanyUserInput,
} from "../domain/entities/company-user.js";
import type { CreateLoginLinkInput, LoginLink } from "../domain/entities/login-link.js";
import type { ChatSessionRepository } from "../domain/repositories/chat-session-repository.js";
import type { CompanyUserRepository } from "../domain/repositories/company-user-repository.js";
import type { LoginLinkRepository } from "../domain/repositories/login-link-repository.js";

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

export class InMemoryCompanyUserRepository implements CompanyUserRepository {
  private readonly store = new Map<string, CompanyUser>();
  private readonly nextId = ids();

  addUser(input: {
    username: string;
    passwordHash: string;
    displayName?: string;
    role?: CompanyUser["role"];
    active?: boolean;
    registeredPhone?: string | null;
    failedAttempts?: number;
    lockedUntil?: Date | null;
  }): CompanyUser {
    const user: CompanyUser = {
      id: this.nextId(),
      username: input.username,
      passwordHash: input.passwordHash,
      displayName: input.displayName ?? "Usuario de prueba",
      role: input.role ?? "USER",
      active: input.active ?? true,
      registeredPhone: input.registeredPhone ?? null,
      failedAttempts: input.failedAttempts ?? 0,
      lockedUntil: input.lockedUntil ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.store.set(user.id, user);
    return user;
  }

  async findByUsername(username: string): Promise<CompanyUser | null> {
    return [...this.store.values()].find((user) => user.username === username) ?? null;
  }

  async findById(id: string): Promise<CompanyUser | null> {
    return this.store.get(id) ?? null;
  }

  async list(): Promise<CompanyUser[]> {
    return [...this.store.values()];
  }

  async create(input: CreateCompanyUserInput): Promise<CompanyUser> {
    return this.addUser(input);
  }

  async update(id: string, input: UpdateCompanyUserInput): Promise<CompanyUser | null> {
    const user = this.store.get(id);
    if (!user) return null;
    if (input.displayName !== undefined) user.displayName = input.displayName;
    if (input.role !== undefined) user.role = input.role;
    if (input.active !== undefined) user.active = input.active;
    if (input.registeredPhone !== undefined) user.registeredPhone = input.registeredPhone;
    if (input.passwordHash !== undefined) user.passwordHash = input.passwordHash;
    user.updatedAt = new Date();
    return user;
  }

  async incrementFailedAttempts(id: string): Promise<number> {
    const user = this.store.get(id);
    if (!user) throw new Error("usuario inexistente");
    user.failedAttempts += 1;
    return user.failedAttempts;
  }

  async lockUntil(id: string, until: Date): Promise<void> {
    const user = this.store.get(id);
    if (user) user.lockedUntil = until;
  }

  async resetFailedAttempts(id: string): Promise<void> {
    const user = this.store.get(id);
    if (user) {
      user.failedAttempts = 0;
      user.lockedUntil = null;
    }
  }
}

export class InMemoryLoginLinkRepository implements LoginLinkRepository {
  private readonly store = new Map<string, LoginLink>();
  private readonly nextId = ids();

  addLink(input: CreateLoginLinkInput & { usedAt?: Date | null }): LoginLink {
    const link: LoginLink = {
      id: this.nextId(),
      tokenHash: input.tokenHash,
      channel: input.channel,
      contactId: input.contactId,
      expiresAt: input.expiresAt,
      usedAt: input.usedAt ?? null,
      createdAt: new Date(),
    };
    this.store.set(link.id, link);
    return link;
  }

  async create(input: CreateLoginLinkInput): Promise<LoginLink> {
    return this.addLink(input);
  }

  async findByTokenHash(tokenHash: string): Promise<LoginLink | null> {
    return [...this.store.values()].find((link) => link.tokenHash === tokenHash) ?? null;
  }

  async markUsed(id: string, usedAt: Date): Promise<void> {
    const link = this.store.get(id);
    if (link && link.usedAt === null) link.usedAt = usedAt;
  }

  async consume(tokenHash: string, now: Date): Promise<boolean> {
    const link = [...this.store.values()].find((l) => l.tokenHash === tokenHash);
    if (!link || link.usedAt !== null || link.expiresAt.getTime() <= now.getTime()) return false;
    link.usedAt = now;
    return true;
  }

  async invalidateActiveForContact(channel: string, contactId: string, now: Date): Promise<void> {
    for (const link of this.store.values()) {
      if (link.channel === channel && link.contactId === contactId && link.usedAt === null) {
        link.usedAt = now;
      }
    }
  }
}

export class InMemoryChatSessionRepository implements ChatSessionRepository {
  private readonly store = new Map<string, ChatSession>();
  private readonly nextId = ids();
  private readonly users: InMemoryCompanyUserRepository;

  constructor(users: InMemoryCompanyUserRepository) {
    this.users = users;
  }

  async create(input: CreateChatSessionInput): Promise<ChatSession> {
    const session: ChatSession = {
      id: this.nextId(),
      companyUserId: input.companyUserId,
      channel: input.channel,
      contactId: input.contactId,
      expiresAt: input.expiresAt,
      absoluteExpiresAt: input.absoluteExpiresAt,
      revokedAt: null,
      lastActivityAt: input.now,
      createdAt: input.now,
    };
    this.store.set(session.id, session);
    return session;
  }

  async findActiveByContact(channel: string, contactId: string): Promise<ChatSessionWithOwner | null> {
    const rows = [...this.store.values()]
      .filter((s) => s.channel === channel && s.contactId === contactId && s.revokedAt === null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const session = rows[0];
    return session ? this.withOwner(session) : null;
  }

  async findById(id: string): Promise<ChatSession | null> {
    return this.store.get(id) ?? null;
  }

  async listActive(): Promise<ChatSessionWithOwner[]> {
    const rows = [...this.store.values()].filter((s) => s.revokedAt === null);
    const result: ChatSessionWithOwner[] = [];
    for (const session of rows) result.push(await this.withOwner(session));
    return result;
  }

  async touch(id: string, lastActivityAt: Date, expiresAt: Date): Promise<void> {
    const session = this.store.get(id);
    if (session && session.revokedAt === null) {
      session.lastActivityAt = lastActivityAt;
      session.expiresAt = expiresAt;
    }
  }

  async revoke(id: string, revokedAt: Date): Promise<void> {
    const session = this.store.get(id);
    if (session && session.revokedAt === null) session.revokedAt = revokedAt;
  }

  private async withOwner(session: ChatSession): Promise<ChatSessionWithOwner> {
    const owner = await this.users.findById(session.companyUserId);
    if (!owner) throw new Error("el dueño de la sesión no existe");
    return {
      session,
      owner: { id: owner.id, displayName: owner.displayName, role: owner.role, active: owner.active },
    };
  }
}

export class InMemoryAuditWriter implements AuditWriter {
  readonly entries: AuditEntry[] = [];
  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}
