import type { CompanyRole } from "./company-user.js";

/** Sesión de chat ligada a (channel, contactId). Solo se persiste el hash del sessionId. */
export interface ChatSession {
  id: string;
  companyUserId: string;
  channel: string;
  contactId: string;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  lastActivityAt: Date;
  createdAt: Date;
}

export interface ChatSessionOwner {
  id: string;
  displayName: string;
  role: CompanyRole;
  active: boolean;
}

export interface ChatSessionWithOwner {
  session: ChatSession;
  owner: ChatSessionOwner;
}

export interface CreateChatSessionInput {
  companyUserId: string;
  channel: string;
  contactId: string;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  now: Date;
}

export function isChatSessionExpired(session: ChatSession, now: Date): boolean {
  return (
    now.getTime() >= session.expiresAt.getTime() ||
    now.getTime() >= session.absoluteExpiresAt.getTime()
  );
}
