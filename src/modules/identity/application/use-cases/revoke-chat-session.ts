import { NotFoundError } from "../../../../shared/errors/app.error.js";
import type { AuditWriter } from "../../domain/audit.js";
import type { ChatSessionService } from "../chat-session-service.js";

export interface RevokeChatSessionDeps {
  sessions: ChatSessionService;
  audit: AuditWriter;
}

export interface RevokeChatSessionCommand {
  id: string;
  adminId: string;
  ip?: string | null;
}

export class RevokeChatSessionUseCase {
  constructor(private readonly deps: RevokeChatSessionDeps) {}

  async execute(command: RevokeChatSessionCommand): Promise<void> {
    const revoked = await this.deps.sessions.revokeById(command.id);
    if (!revoked) throw new NotFoundError("Sesión no encontrada o ya revocada", "SESSION_NOT_FOUND");

    await this.deps.audit.record({
      actorType: "ADMIN",
      actorId: command.adminId,
      action: "CHAT_SESSION_REVOKED",
      targetType: "chat_session",
      targetId: revoked.id,
      ip: command.ip ?? null,
      metadata: { channel: revoked.channel, contactId: revoked.contactId, reason: "admin" },
    });
  }
}
