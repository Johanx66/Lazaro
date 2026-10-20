import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { CreateLoginLinkInput, LoginLink } from "../domain/entities/login-link.js";
import type { LoginLinkRepository } from "../domain/repositories/login-link-repository.js";

export class PrismaLoginLinkRepository implements LoginLinkRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(input: CreateLoginLinkInput): Promise<LoginLink> {
    return this.db.loginLink.create({ data: input });
  }

  async findByTokenHash(tokenHash: string): Promise<LoginLink | null> {
    return this.db.loginLink.findUnique({ where: { tokenHash } });
  }

  async markUsed(id: string, usedAt: Date): Promise<void> {
    await this.db.loginLink.updateMany({ where: { id, usedAt: null }, data: { usedAt } });
  }

  async consume(tokenHash: string, now: Date): Promise<boolean> {
    const result = await this.db.loginLink.updateMany({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });
    return result.count > 0;
  }

  async invalidateActiveForContact(channel: string, contactId: string, now: Date): Promise<void> {
    await this.db.loginLink.updateMany({
      where: { channel, contactId, usedAt: null },
      data: { usedAt: now },
    });
  }
}
