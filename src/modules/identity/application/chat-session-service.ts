import { isChatSessionExpired } from "../domain/entities/chat-session.js";
import type { ChatSession, ChatSessionWithOwner } from "../domain/entities/chat-session.js";
import type { Clock } from "../domain/clock.js";
import type { CompanyRole } from "../domain/entities/company-user.js";
import type { ChatSessionRepository } from "../domain/repositories/chat-session-repository.js";
import { CHAT_LOGIN_ALLOWED_ROLES } from "./policy.js";

export interface CreatedChatSession {
  session: ChatSession;
}

export interface ChatSessionServiceDeps {
  repository: ChatSessionRepository;
  clock: Clock;
  idleMs: number;
  absoluteMs: number;
  /** Roles autorizados a usar el chat. Por defecto, los de `policy.ts`. */
  allowedRoles?: readonly CompanyRole[];
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
   * vencida (inactividad o tope absoluto), revocada o de un usuario no autorizado
   * (inactivo o bloqueado temporalmente) se revoca y se trata como inexistente.
   *
   * La autorización del cliente no se deduce de la sesión: el dueño de la sesión
   * debe ser un usuario de empresa activo y no bloqueado. Si deja de estar
   * autorizado, la sesión se revoca en el acto.
   */
  async getActive(channel: string, contactId: string): Promise<ChatSessionWithOwner | null> {
    const found = await this.deps.repository.findActiveByContact(channel, contactId);
    if (!found) return null;

    const now = this.deps.clock.now();
    if (
      found.session.revokedAt !== null ||
      !this.isAuthorized(found.owner, now) ||
      isChatSessionExpired(found.session, now)
    ) {
      await this.deps.repository.revoke(found.session.id, now);
      return null;
    }

    await this.deps.repository.touch(found.session.id, now, new Date(now.getTime() + this.deps.idleMs));
    return found;
  }

  /** Un cliente está autorizado si su cuenta está activa, no bloqueada y su rol puede usar el chat. */
  private isAuthorized(owner: ChatSessionWithOwner["owner"], now: Date): boolean {
    if (!owner.active) return false;
    if (owner.lockedUntil !== null && owner.lockedUntil.getTime() > now.getTime()) return false;
    return this.allowedRoles.includes(owner.role);
  }

  /** Roles autorizados a usar el chat (los de `policy.ts` si no se pasan otros). */
  private get allowedRoles(): readonly CompanyRole[] {
    return this.deps.allowedRoles ?? CHAT_LOGIN_ALLOWED_ROLES;
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

  /**
   * Revoca todas las sesiones abiertas de un cliente. Se invoca cuando cambia
   * su teléfono registrado: el contacto anterior no puede seguir usando la
   * sesión y debe volver a verificarse. Devuelve cuántas se revocaron.
   */
  async revokeByCompanyUser(companyUserId: string): Promise<number> {
    return this.deps.repository.revokeAllByCompanyUser(companyUserId, this.deps.clock.now());
  }

  async listActive(): Promise<ChatSessionWithOwner[]> {
    const active = await this.deps.repository.listActive();
    const now = this.deps.clock.now();
    return active.filter(
      (found) => !isChatSessionExpired(found.session, now) && this.isAuthorized(found.owner, now),
    );
  }
}
