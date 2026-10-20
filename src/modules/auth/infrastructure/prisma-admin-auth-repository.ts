import type { PrismaClient } from "../../../generated/prisma/client.js";
import type {
  AdminAccount,
  AdminAuthRepository,
  CreateSessionInput,
  SessionWithOwner,
} from "../domain/admin-auth-repository.js";

export class PrismaAdminAuthRepository implements AdminAuthRepository {
  constructor(private readonly db: PrismaClient) {}

  async findAdminByEmail(email: string): Promise<AdminAccount | null> {
    return this.db.adminUser.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        active: true,
        failedAttempts: true,
        lockedUntil: true,
      },
    });
  }

  async incrementFailedAttempts(adminId: string): Promise<number> {
    // `increment` se traduce en un UPDATE ... SET failedAttempts = failedAttempts + 1 atómico.
    const updated = await this.db.adminUser.update({
      where: { id: adminId },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    });
    return updated.failedAttempts;
  }

  async lockUntil(adminId: string, until: Date): Promise<void> {
    await this.db.adminUser.update({ where: { id: adminId }, data: { lockedUntil: until } });
  }

  async resetFailedAttempts(adminId: string): Promise<void> {
    await this.db.adminUser.update({
      where: { id: adminId },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  }

  async createSession(input: CreateSessionInput): Promise<void> {
    await this.db.adminSession.create({
      data: {
        adminUserId: input.adminUserId,
        tokenHash: input.tokenHash,
        createdAt: input.now,
        lastSeenAt: input.now,
        expiresAt: input.expiresAt,
      },
    });
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionWithOwner | null> {
    const row = await this.db.adminSession.findUnique({
      where: { tokenHash },
      include: { adminUser: { select: { id: true, email: true, role: true, active: true } } },
    });
    if (!row) return null;
    const { adminUser, ...session } = row;
    return { session, owner: adminUser };
  }

  async touchSession(sessionId: string, now: Date): Promise<void> {
    // updateMany: no falla si otra petición borró la sesión entre medias.
    await this.db.adminSession.updateMany({ where: { id: sessionId }, data: { lastSeenAt: now } });
  }

  async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.db.adminSession.deleteMany({ where: { tokenHash } });
  }
}
