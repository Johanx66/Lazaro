import type { Prisma, PrismaClient } from "../../../generated/prisma/client.js";
import type { AuditEntry, AuditWriter } from "../domain/audit.js";

export class PrismaAuditLogRepository implements AuditWriter {
  constructor(private readonly db: PrismaClient) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.db.auditLog.create({
      data: {
        actorType: entry.actorType,
        actorId: entry.actorId ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        ip: entry.ip ?? null,
        metadata: entry.metadata === null || entry.metadata === undefined
          ? undefined
          : (entry.metadata as Prisma.InputJsonObject),
      },
    });
  }
}
