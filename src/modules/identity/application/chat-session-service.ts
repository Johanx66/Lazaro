import { isChatSessionExpired } from "../domain/entities/chat-session.js";
import type { ChatSession, ChatSessionWithOwner } from "../domain/entities/chat-session.js";
import type { Clock } from "../domain/clock.js";
import type { ChatSessionRepository } from "../domain/repositories/chat-session-repository.js";

export interface CreatedChatSession {
  session: ChatSession;
}

export interface ChatSessionServiceDeps {
  repository: ChatSessionRepository;
  clock: Clock;
  idleMs: number;
  absoluteMs: number;
}

export class ChatSessionService {
  constructor(private readonly deps: ChatSessionServiceDeps) {}

  async create(companyUserId: string, channel: string, contactId: string): Promise<CreatedChatSession> {
    const now = this.deps.clock.now();
    const expiresAt = new Date(now.getTime() + this.deps.idleMs);
    const session = await this.deps.repository.create({
      companyUserId,
      channel,
      contactId,
      expiresAt,
      absoluteExpiresAt: new Date(now.getTime() + this.deps.absoluteMs),
      now,
    });
    return { session };
  }

  /**
   * Devuelve la sesión vigente de un contacto y renueva su inactividad. Una sesión
   * vencida (inactividad o tope absoluto), revocada o de un usuario inactivo se revoca
   * y se trata como inexistente.
   */
  async getActive(channel: string, contactId: string): Promise<ChatSessionWithOwner | null> {
    const found = await this.deps.repository.findActiveByContact(channel, contactId);
    if (!found) return null;

    const now = this.deps.clock.now();
    if (found.session.revokedAt !== null || !found.owner.active || isChatSessionExpired(found.session, now)) {
      await this.deps.repository.revoke(found.session.id, now);
      return null;
    }

    await this.deps.repository.touch(found.session.id, now, new Date(now.getTime() + this.deps.idleMs));
    return found;
  }

  async revokeByContact(channel: string, contactId: string): Promise<boolean> {
    const found = await this.deps.repository.findActiveByContact(channel, contactId);
    if (!found) return false;
    await this.deps.repository.revoke(found.session.id, this.deps.clock.now());
    return true;
  }

  async revokeById(sessionId: string): Promise<ChatSession | null> {
    const session = await this.deps.repository.findById(sessionId);
    if (!session || session.revokedAt !== null) return null;
    const revokedAt = this.deps.clock.now();
    await this.deps.repository.revoke(session.id, revokedAt);
    return { ...session, revokedAt };
  }

  async listActive(): Promise<ChatSessionWithOwner[]> {
    const active = await this.deps.repository.listActive();
    const now = this.deps.clock.now();
    return active.filter(
      (found) => !isChatSessionExpired(found.session, now) && found.owner.active,
    );
  }
}
