import type { PrismaClient } from "../../../generated/prisma/client.js";
import type {
  ChatSession,
  ChatSessionWithOwner,
  CreateChatSessionInput,
} from "../domain/entities/chat-session.js";
import type { CompanyRole } from "../domain/entities/company-user.js";
import type { ChatSessionOwner } from "../domain/entities/chat-session.js";
import type { ChatSessionRepository } from "../domain/repositories/chat-session-repository.js";

const ownerSelect = {
  id: true,
  displayName: true,
  role: true,
  active: true,
  lockedUntil: true,
  companyCustomerId: true,
} as const;

type OwnerRow = {
  id: string;
  displayName: string;
  role: CompanyRole;
  active: boolean;
  lockedUntil: Date | null;
  companyCustomerId: string | null;
};

function toDomain(row: {
  id: string;
  companyUserId: string;
  channel: string;
  contactId: string;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  lastActivityAt: Date;
  createdAt: Date;
}): ChatSession {
  return {
    id: row.id,
    companyUserId: row.companyUserId,
    channel: row.channel,
    contactId: row.contactId,
    expiresAt: row.expiresAt,
    absoluteExpiresAt: row.absoluteExpiresAt,
    revokedAt: row.revokedAt,
    lastActivityAt: row.lastActivityAt,
    createdAt: row.createdAt,
  };
}

export class PrismaChatSessionRepository implements ChatSessionRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(input: CreateChatSessionInput): Promise<ChatSession> {
    const row = await this.db.chatSession.create({
      data: {
        companyUserId: input.companyUserId,
        channel: input.channel,
        contactId: input.contactId,
        expiresAt: input.expiresAt,
        absoluteExpiresAt: input.absoluteExpiresAt,
        lastActivityAt: input.now,
        createdAt: input.now,
      },
    });
    return toDomain(row);
  }

  async findActiveByContact(channel: string, contactId: string): Promise<ChatSessionWithOwner | null> {
    const row = await this.db.chatSession.findFirst({
      where: { channel, contactId, revokedAt: null },
      orderBy: { createdAt: "desc" },
      include: { companyUser: { select: ownerSelect } },
    });
    if (!row) return null;
    const { companyUser, ...session } = row;
    return { session: toDomain(session), owner: toOwner(companyUser) };
  }

  async findById(id: string): Promise<ChatSession | null> {
    const row = await this.db.chatSession.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async listActive(): Promise<ChatSessionWithOwner[]> {
    const rows = await this.db.chatSession.findMany({
      where: { revokedAt: null },
      orderBy: { createdAt: "desc" },
      include: { companyUser: { select: ownerSelect } },
    });
    return rows.map((row) => {
      const { companyUser, ...session } = row;
      return { session: toDomain(session), owner: toOwner(companyUser) };
    });
  }

  async touch(id: string, lastActivityAt: Date, expiresAt: Date): Promise<void> {
    await this.db.chatSession.updateMany({
      where: { id, revokedAt: null },
      data: { lastActivityAt, expiresAt },
    });
  }

  async revoke(id: string, revokedAt: Date): Promise<void> {
    await this.db.chatSession.updateMany({ where: { id, revokedAt: null }, data: { revokedAt } });
  }

  /** Una sola sentencia: todas las sesiones abiertas del cliente quedan revocadas. */
  async revokeAllByCompanyUser(companyUserId: string, revokedAt: Date): Promise<number> {
    const result = await this.db.chatSession.updateMany({
      where: { companyUserId, revokedAt: null },
      data: { revokedAt },
    });
    return result.count;
  }
}

function toOwner(row: OwnerRow): ChatSessionOwner {
  return {
    id: row.id,
    displayName: row.displayName,
    role: row.role as CompanyRole,
    active: row.active,
    lockedUntil: row.lockedUntil,
    companyCustomerId: row.companyCustomerId,
  };
}
