import type { CompanyRole } from "../../domain/entities/company-user.js";
import { maskContact } from "../mask.js";
import type { ChatSessionService } from "../chat-session-service.js";

export interface ListChatSessionsDeps {
  sessions: ChatSessionService;
}

export interface ChatSessionListItem {
  id: string;
  channel: string;
  maskedContact: string;
  companyUserId: string;
  displayName: string;
  role: CompanyRole;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  absoluteExpiresAt: Date;
}

export class ListChatSessionsUseCase {
  constructor(private readonly deps: ListChatSessionsDeps) {}

  async execute(): Promise<ChatSessionListItem[]> {
    const active = await this.deps.sessions.listActive();
    return active.map(({ session, owner }) => ({
      id: session.id,
      channel: session.channel,
      maskedContact: maskContact(session.contactId),
      companyUserId: owner.id,
      displayName: owner.displayName,
      role: owner.role,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      expiresAt: session.expiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
    }));
  }
}
