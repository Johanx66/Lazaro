import type { AuditWriter } from "../../domain/audit.js";
import type { ChatSessionService } from "../chat-session-service.js";

export interface LogoutChatDeps {
  sessions: ChatSessionService;
  audit: AuditWriter;
}

export interface LogoutChatCommand {
  channel: string;
  contactId: string;
  ip?: string | null;
}

export class LogoutChatUseCase {
  constructor(private readonly deps: LogoutChatDeps) {}

  /** Cierra la sesión vigente del contacto, si la hay. Idempotente. */
  async execute(command: LogoutChatCommand): Promise<{ hadSession: boolean }> {
    const hadSession = await this.deps.sessions.revokeByContact(command.channel, command.contactId);
    if (hadSession) {
      await this.deps.audit.record({
        actorType: "COMPANY_USER",
        action: "CHAT_SESSION_REVOKED",
        targetType: "chat_session",
        ip: command.ip ?? null,
        metadata: { channel: command.channel, contactId: command.contactId, reason: "logout" },
      });
    }
    return { hadSession };
  }
}
