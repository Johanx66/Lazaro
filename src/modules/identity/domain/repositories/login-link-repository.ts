import type { CreateLoginLinkInput, LoginLink } from "../entities/login-link.js";

export interface LoginLinkRepository {
  create(input: CreateLoginLinkInput): Promise<LoginLink>;
  findByTokenHash(tokenHash: string): Promise<LoginLink | null>;
  /** Marca el enlace como usado. Idempotente si ya estaba usado. */
  markUsed(id: string, usedAt: Date): Promise<void>;
  /** Consume un enlace si está activo (no usado y no expirado). Retorna true si fue consumido. */
  consume(tokenHash: string, now: Date): Promise<boolean>;
  /** Invalida los enlaces vigentes de un contacto (al pedir uno nuevo). Idempotente. */
  invalidateActiveForContact(channel: string, contactId: string, now: Date): Promise<void>;
}
