import type {
  AdminAuthRepository,
  AdminRole,
  AdminSessionRecord,
  Clock,
} from "../domain/admin-auth-repository.js";
import { SESSION_ABSOLUTE_TIMEOUT_MS, SESSION_IDLE_TIMEOUT_MS } from "./session-policy.js";
import { generateSessionToken, hashSessionToken, isWellFormedSessionToken } from "./session-token.js";

export interface CreatedSession {
  /** Token en claro: solo se entrega a la cookie, nunca se guarda ni se registra. */
  token: string;
  expiresAt: Date;
}

export interface SessionPrincipal {
  adminId: string;
  email: string;
  role: AdminRole;
}

export function isSessionExpired(session: AdminSessionRecord, now: Date): boolean {
  const idleExpired = now.getTime() - session.lastSeenAt.getTime() >= SESSION_IDLE_TIMEOUT_MS;
  const absoluteExpired = now.getTime() >= session.expiresAt.getTime();
  return idleExpired || absoluteExpired;
}

export interface SessionServiceDeps {
  repository: AdminAuthRepository;
  clock: Clock;
}

export class SessionService {
  constructor(private readonly deps: SessionServiceDeps) {}

  async create(adminUserId: string): Promise<CreatedSession> {
    const now = this.deps.clock.now();
    const token = generateSessionToken();
    const expiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS);
    await this.deps.repository.createSession({
      adminUserId,
      tokenHash: hashSessionToken(token),
      now,
      expiresAt,
    });
    return { token, expiresAt };
  }

  /**
   * Valida el token y, si la sesión es válida, renueva lastSeenAt (vencimiento deslizante).
   * Una sesión vencida (inactividad o tope absoluto) o de un usuario desactivado se borra.
   */
  async validate(token: string): Promise<SessionPrincipal | null> {
    if (!isWellFormedSessionToken(token)) return null;

    const tokenHash = hashSessionToken(token);
    const found = await this.deps.repository.findSessionByTokenHash(tokenHash);
    if (!found) return null;

    const now = this.deps.clock.now();
    if (isSessionExpired(found.session, now) || !found.owner.active) {
      await this.deps.repository.deleteSessionByTokenHash(tokenHash);
      return null;
    }

    await this.deps.repository.touchSession(found.session.id, now);
    return { adminId: found.owner.id, email: found.owner.email, role: found.owner.role };
  }

  /** Idempotente: no falla si la sesión no existe. */
  async destroy(token: string): Promise<void> {
    if (!isWellFormedSessionToken(token)) return;
    await this.deps.repository.deleteSessionByTokenHash(hashSessionToken(token));
  }
}
