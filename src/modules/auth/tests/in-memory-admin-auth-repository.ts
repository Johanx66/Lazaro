import { randomUUID } from "node:crypto";
import type {
  AdminAccount,
  AdminAuthRepository,
  AdminSessionRecord,
  CreateSessionInput,
  SessionWithOwner,
} from "../domain/admin-auth-repository.js";

/** Repositorio en memoria para tests (sin BD). Imita la semántica del repositorio Prisma. */
export class InMemoryAdminAuthRepository implements AdminAuthRepository {
  readonly admins = new Map<string, AdminAccount>();
  readonly sessions = new Map<string, AdminSessionRecord>();

  addAdmin(overrides: Partial<AdminAccount> & Pick<AdminAccount, "email" | "passwordHash">): AdminAccount {
    const admin: AdminAccount = {
      id: randomUUID(),
      role: "ADMIN",
      active: true,
      failedAttempts: 0,
      lockedUntil: null,
      ...overrides,
    };
    this.admins.set(admin.id, admin);
    return admin;
  }

  adminByEmail(email: string): AdminAccount {
    const found = [...this.admins.values()].find((admin) => admin.email === email);
    if (!found) throw new Error("admin no encontrado en el repositorio de pruebas");
    return found;
  }

  async findAdminByEmail(email: string): Promise<AdminAccount | null> {
    const found = [...this.admins.values()].find((admin) => admin.email === email);
    return found ? { ...found } : null;
  }

  async incrementFailedAttempts(adminId: string): Promise<number> {
    const admin = this.require(adminId);
    admin.failedAttempts += 1;
    return admin.failedAttempts;
  }

  async lockUntil(adminId: string, until: Date): Promise<void> {
    this.require(adminId).lockedUntil = until;
  }

  async resetFailedAttempts(adminId: string): Promise<void> {
    const admin = this.require(adminId);
    admin.failedAttempts = 0;
    admin.lockedUntil = null;
  }

  async createSession(input: CreateSessionInput): Promise<void> {
    const id = randomUUID();
    this.sessions.set(id, {
      id,
      adminUserId: input.adminUserId,
      tokenHash: input.tokenHash,
      createdAt: input.now,
      lastSeenAt: input.now,
      expiresAt: input.expiresAt,
    });
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionWithOwner | null> {
    const session = [...this.sessions.values()].find((item) => item.tokenHash === tokenHash);
    if (!session) return null;
    const admin = this.require(session.adminUserId);
    return {
      session: { ...session },
      owner: { id: admin.id, email: admin.email, role: admin.role, active: admin.active },
    };
  }

  async touchSession(sessionId: string, now: Date): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) session.lastSeenAt = now;
  }

  async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    for (const [id, session] of this.sessions) {
      if (session.tokenHash === tokenHash) this.sessions.delete(id);
    }
  }

  private require(adminId: string): AdminAccount {
    const admin = this.admins.get(adminId);
    if (!admin) throw new Error("admin no encontrado en el repositorio de pruebas");
    return admin;
  }
}
