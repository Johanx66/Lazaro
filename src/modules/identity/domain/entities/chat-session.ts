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

/**
 * Dueño de la sesión: el usuario de empresa (cliente) que la tiene abierta.
 * `active` y `lockedUntil` determinan si ese cliente sigue AUTORIZADO para
 * usar el chatbot; la comprobación se hace en cada mensaje.
 */
export interface ChatSessionOwner {
  id: string;
  displayName: string;
  role: CompanyRole;
  active: boolean;
  /** Bloqueo temporal por intentos fallidos; si está vigente, el cliente no está autorizado. */
  lockedUntil: Date | null;
  /**
   * Código de cliente en la BD de la empresa (p. ej. "CLI-000123"). Sale de la
   * sesión y es la ÚNICA clave con la que se filtran las consultas de datos.
   * `null` = cliente sin vincular: sus consultas de datos se deniegan.
   */
  companyCustomerId: string | null;
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
