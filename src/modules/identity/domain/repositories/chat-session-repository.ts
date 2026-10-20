import type { CreateChatSessionInput, ChatSession, ChatSessionWithOwner } from "../entities/chat-session.js";

export interface ChatSessionRepository {
  create(input: CreateChatSessionInput): Promise<ChatSession>;
  /** Sesión vigente (sin revocar) más reciente de un contacto, con su dueño. */
  findActiveByContact(channel: string, contactId: string): Promise<ChatSessionWithOwner | null>;
  findById(id: string): Promise<ChatSession | null>;
  /** Sesiones vigentes (sin revocar) de todos los contactos, con su dueño. */
  listActive(): Promise<ChatSessionWithOwner[]>;
  /** Renueva lastActivityAt y el vencimiento por inactividad. */
  touch(id: string, lastActivityAt: Date, expiresAt: Date): Promise<void>;
  revoke(id: string, revokedAt: Date): Promise<void>;
}
