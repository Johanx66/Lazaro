import type { PasswordHasher } from "../../../../shared/domain/password-hasher.js";
import type { AuditWriter } from "../../domain/audit.js";
import type { Clock } from "../../domain/clock.js";
import type { CompanyRole } from "../../domain/entities/company-user.js";
import type { LoginLink } from "../../domain/entities/login-link.js";
import type { ChatMenuNotifier, ChatNotifier } from "../../domain/notifier.js";
import type { CompanyUserRepository } from "../../domain/repositories/company-user-repository.js";
import type { LoginLinkRepository } from "../../domain/repositories/login-link-repository.js";
import type { ChatSessionService } from "../chat-session-service.js";
import { ChatInvalidCredentialsError } from "../errors.js";
import { phoneMatches } from "../mask.js";
import { ACCOUNT_LOCK_DURATION_MS, CHAT_LOGIN_ALLOWED_ROLES, MAX_FAILED_LOGIN_ATTEMPTS } from "../policy.js";
import { hashToken, isWellFormedToken } from "../tokens.js";

export type ChatLoginFailureReason =
  | "invalid_link"
  | "unknown_user"
  | "inactive_user"
  | "locked"
  | "wrong_password"
  | "phone_mismatch"
  | "role_not_allowed";

export interface ChatLoginCommand {
  /** Usuario ya normalizado (minúsculas, sin espacios) por la validación de entrada. */
  username: string;
  password: string;
  /** Token del enlace de login recibido por el chat. */
  token: string;
  ip: string;
}

export interface ChatLoginResult {
  displayName: string;
  role: CompanyRole;
  channel: string;
}

export interface ChatLoginDeps {
  companyUsers: CompanyUserRepository;
  links: LoginLinkRepository;
  sessions: ChatSessionService;
  hasher: PasswordHasher;
  clock: Clock;
  audit: AuditWriter;
  notifier: ChatNotifier;
  /**
   * Entrega el menú de atención al chat verificado. Opcional: sin él, el login
   * funciona igual y no se envía ningún menú.
   */
  menuNotifier?: ChatMenuNotifier;
  /** Hash argon2id de relleno para igualar tiempos si el usuario no existe. */
  fillerHash: Promise<string>;
  /** Si true, el teléfono del contacto debe coincidir con el registrado del usuario. */
  requirePhoneMatch: boolean;
  /**
   * Si true, la coincidencia de teléfono NO se exige cuando el enlace es del canal
   * TELEGRAM (su contactId es un chat.id, no un teléfono). Por defecto false.
   */
  skipPhoneMatchForTelegram?: boolean;
}

export class ChatLoginUseCase {
  constructor(private readonly deps: ChatLoginDeps) {}

  async execute(command: ChatLoginCommand): Promise<ChatLoginResult> {
    const { companyUsers, links, sessions, hasher, clock, audit } = this.deps;
    const now = clock.now();

    const user = await companyUsers.findByUsername(command.username);

    // Siempre se ejecuta exactamente un verify (hash real o de relleno) para no delatar
    // por tiempo si el usuario existe.
    const hashToCheck = user ? user.passwordHash : await this.deps.fillerHash;
    const passwordMatches = await hasher.verify(hashToCheck, command.password);

    const link = await this.resolveLink(command.token, now);

    const reject = async (
      reason: ChatLoginFailureReason,
      extra: { lockedNow?: boolean } = {},
    ): Promise<never> => {
      await audit.record({
        actorType: "SYSTEM",
        actorId: user ? user.id : null,
        action: "LOGIN_FAILED",
        targetType: user ? "company_user" : null,
        targetId: user ? user.id : null,
        ip: command.ip,
        metadata: { reason, ...extra },
      });
      throw new ChatInvalidCredentialsError();
    };

    if (!link) return reject("invalid_link");
    if (!user) return reject("unknown_user");
    if (!user.active) return reject("inactive_user");
    if (!CHAT_LOGIN_ALLOWED_ROLES.includes(user.role)) {
      return reject("role_not_allowed");
    }
    if (user.lockedUntil !== null && user.lockedUntil.getTime() > now.getTime()) {
      return reject("locked");
    }

    if (!passwordMatches) {
      const lockedNow = await this.registerFailure(user.id, user.lockedUntil, now);
      return reject("wrong_password", { lockedNow });
    }

    const phoneMatchSkipped =
      this.deps.skipPhoneMatchForTelegram === true && link.channel === "TELEGRAM";
    if (this.deps.requirePhoneMatch && !phoneMatchSkipped && !phoneMatches(user.registeredPhone, link.contactId)) {
      return reject("phone_mismatch");
    }

    await companyUsers.resetFailedAttempts(user.id);
    const consumed = await links.consume(hashToken(command.token), now);
    if (!consumed) {
      await audit.record({
        actorType: "SYSTEM",
        actorId: user.id,
        action: "LOGIN_FAILED",
        targetType: "company_user",
        targetId: user.id,
        ip: command.ip,
        metadata: { reason: "invalid_link" },
      });
      throw new ChatInvalidCredentialsError();
    }
    const created = await sessions.create(user.id, link.channel, link.contactId);

    await audit.record({
      actorType: "COMPANY_USER",
      actorId: user.id,
      action: "LOGIN_SUCCESS",
      targetType: "company_user",
      targetId: user.id,
      ip: command.ip,
      metadata: { channel: link.channel },
    });
    await audit.record({
      actorType: "SYSTEM",
      action: "CHAT_SESSION_CREATED",
      targetType: "chat_session",
      targetId: created.session.id,
      ip: command.ip,
      metadata: { channel: link.channel, contactId: link.contactId, companyUserId: user.id },
    });

    // Aviso al usuario por su canal. Un fallo aquí no rompe el login.
    try {
      await this.deps.notifier.send(
        link.channel,
        link.contactId,
        `Sesión iniciada como ${user.displayName}. Si no fuiste tú, escribe "salir".`,
      );
    } catch {
      // Ignorado a propósito.
    }

    // Menú de atención: se entrega al MISMO chat del enlace (channel, contactId).
    // No se confía en ningún chat_id recibido: la asociación segura es la del
    // enlace de un solo uso que se acaba de consumir, y la sesión que se acaba
    // de crear usa esa misma pareja. Un fallo aquí no rompe el login.
    if (this.deps.menuNotifier) {
      try {
        await this.deps.menuNotifier.sendMenu(link.channel, link.contactId);
      } catch {
        // Ignorado a propósito.
      }
    }

    return { displayName: user.displayName, role: user.role, channel: link.channel };
  }

  private async resolveLink(token: string, now: Date): Promise<LoginLink | null> {
    if (!isWellFormedToken(token)) return null;
    const link = await this.deps.links.findByTokenHash(hashToken(token));
    if (!link) return null;
    if (link.usedAt !== null || link.expiresAt.getTime() <= now.getTime()) return null;
    return link;
  }

  /** Suma un fallo (atómico en la BD) y bloquea la cuenta al llegar al máximo. Devuelve si bloqueó. */
  private async registerFailure(
    userId: string,
    lockedUntil: Date | null,
    now: Date,
  ): Promise<boolean> {
    const { companyUsers } = this.deps;

    // Si el bloqueo anterior ya venció, se empieza de cero: 5 intentos nuevos.
    if (lockedUntil !== null) {
      await companyUsers.resetFailedAttempts(userId);
    }

    const failedAttempts = await companyUsers.incrementFailedAttempts(userId);
    if (failedAttempts < MAX_FAILED_LOGIN_ATTEMPTS) return false;

    await companyUsers.lockUntil(userId, new Date(now.getTime() + ACCOUNT_LOCK_DURATION_MS));
    return true;
  }
}
