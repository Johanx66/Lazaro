import type { Express } from "express";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type {
  ChatIdentityPort,
  ChatChannel,
  ChatSessionPrincipal,
  LoginLinkDelivery,
} from "../../bot/application/process-incoming-message.js";
import { rateLimit } from "../../shared/http/rate-limit.js";
import { Argon2PasswordHasher } from "../../shared/infrastructure/argon2-password-hasher.js";
import { requireRole } from "../auth/presentation/api-guard.js";
import { createFillerHash } from "../auth/application/filler-hash.js";
import { ChatSessionService } from "./application/chat-session-service.js";
import { LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS } from "./application/policy.js";
import {
  chatSessionAbsoluteMs,
  chatSessionIdleMs,
  loginLinkTtlMs,
} from "./application/policy.js";
import { ChatLoginUseCase } from "./application/use-cases/chat-login.js";
import { CreateCompanyUserUseCase } from "./application/use-cases/create-company-user.js";
import { GenerateLoginLinkUseCase } from "./application/use-cases/generate-login-link.js";
import { ListChatSessionsUseCase } from "./application/use-cases/list-chat-sessions.js";
import { ListCompanyUsersUseCase } from "./application/use-cases/list-company-users.js";
import { LogoutChatUseCase } from "./application/use-cases/logout-chat.js";
import { RevokeChatSessionUseCase } from "./application/use-cases/revoke-chat-session.js";
import { UpdateCompanyUserUseCase } from "./application/use-cases/update-company-user.js";
import { ValidateLoginLinkUseCase } from "./application/use-cases/validate-login-link.js";
import type { ChatNotifier } from "./domain/notifier.js";
import { PrismaAuditLogRepository } from "./infrastructure/prisma-audit-log-repository.js";
import { PrismaChatSessionRepository } from "./infrastructure/prisma-chat-session-repository.js";
import { PrismaCompanyUserRepository } from "./infrastructure/prisma-company-user-repository.js";
import { PrismaLoginLinkRepository } from "./infrastructure/prisma-login-link-repository.js";
import { ChatSessionController } from "./presentation/chat-session-controller.js";
import { chatSessionRoutes } from "./presentation/chat-session-routes.js";
import { CompanyUserController } from "./presentation/company-user-controller.js";
import { companyUserRoutes } from "./presentation/company-user-routes.js";
import { LoginController } from "./presentation/login-controller.js";
import { loginRoutes } from "./presentation/login-routes.js";
import { requireTrustedOrigin } from "./presentation/origin-check.js";

export interface WireIdentityOptions {
  /** Base pública absoluta sin barra final; se usa para construir el enlace de login. */
  publicBaseUrl: string;
  loginLinkTtlMinutes: number;
  chatSessionIdleMinutes: number;
  chatSessionAbsoluteHours: number;
  requirePhoneMatch: boolean;
  /** Si true, no exige coincidencia de teléfono cuando el enlace es del canal TELEGRAM. */
  skipPhoneMatchForTelegram?: boolean;
  /** Orígenes válidos para el chequeo de origen en POST /api/identity/login. */
  trustedOrigins: string[];
  /** Avisa al usuario por su canal cuando inicia sesión. */
  notifier: ChatNotifier;
}

export interface IdentityServices {
  /** Puerto que consume el bot para gestionar la sesión a través del chat. */
  chatIdentity: ChatIdentityPort;
  sessions: ChatSessionService;
}

export function wireIdentity(
  app: Express,
  db: PrismaClient,
  options: WireIdentityOptions,
): IdentityServices {
  const clock = { now: () => new Date() };
  const hasher = new Argon2PasswordHasher();

  const companyUsers = new PrismaCompanyUserRepository(db);
  const links = new PrismaLoginLinkRepository(db);
  const chatSessions = new PrismaChatSessionRepository(db);
  const audit = new PrismaAuditLogRepository(db);

  const sessions = new ChatSessionService({
    repository: chatSessions,
    clock,
    idleMs: chatSessionIdleMs(options.chatSessionIdleMinutes),
    absoluteMs: chatSessionAbsoluteMs(options.chatSessionAbsoluteHours),
  });

  const generateLoginLink = new GenerateLoginLinkUseCase({
    repository: links,
    clock,
    ttlMs: loginLinkTtlMs(options.loginLinkTtlMinutes),
    publicBaseUrl: options.publicBaseUrl,
    audit,
  });
  const validateLoginLink = new ValidateLoginLinkUseCase({ repository: links, clock });
  const chatLogin = new ChatLoginUseCase({
    companyUsers,
    links,
    sessions,
    hasher,
    clock,
    audit,
    notifier: options.notifier,
    fillerHash: createFillerHash(hasher),
    requirePhoneMatch: options.requirePhoneMatch,
    skipPhoneMatchForTelegram: options.skipPhoneMatchForTelegram,
  });
  const logoutChat = new LogoutChatUseCase({ sessions, audit });
  const createCompanyUser = new CreateCompanyUserUseCase({ repository: companyUsers, hasher, audit });
  const listCompanyUsers = new ListCompanyUsersUseCase({ repository: companyUsers });
  const updateCompanyUser = new UpdateCompanyUserUseCase({
    repository: companyUsers,
    hasher,
    audit,
    sessions,
  });
  const listChatSessions = new ListChatSessionsUseCase({ sessions });
  const revokeChatSession = new RevokeChatSessionUseCase({ sessions, audit });

  const loginController = new LoginController({ validateLink: validateLoginLink, chatLogin });
  const loginRateLimit = rateLimit({
    windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
    max: LOGIN_RATE_LIMIT_MAX,
    message: "Demasiados intentos de inicio de sesión. Inténtalo de nuevo en un minuto.",
  });
  app.use(
    "/api/identity",
    loginRoutes(loginController, loginRateLimit, requireTrustedOrigin(options.trustedOrigins)),
  );

  const companyUserController = new CompanyUserController({
    createCompanyUser,
    listCompanyUsers,
    updateCompanyUser,
  });
  app.use("/api/company-users", requireRole("ADMIN"), companyUserRoutes(companyUserController));

  const chatSessionController = new ChatSessionController({
    listChatSessions,
    revokeChatSession,
  });
  app.use("/api/chat-sessions", requireRole("ADMIN"), chatSessionRoutes(chatSessionController));

  const chatIdentity: ChatIdentityPort = {
    async getActiveSessionName(channel: ChatChannel, contactId: string): Promise<string | null> {
      const found = await sessions.getActive(channel, contactId);
      return found ? found.owner.displayName : null;
    },
    async getActivePrincipal(
      channel: ChatChannel,
      contactId: string,
    ): Promise<ChatSessionPrincipal | null> {
      const found = await sessions.getActive(channel, contactId);
      if (!found) return null;
      return {
        companyUserId: found.owner.id,
        displayName: found.owner.displayName,
        role: found.owner.role,
      };
    },
    async startLogin(channel: ChatChannel, contactId: string): Promise<LoginLinkDelivery> {
      const generated = await generateLoginLink.execute({ channel, contactId });
      // Si el contacto ya tenía un enlace vigente se reutiliza: no se genera un
      // token nuevo ni se invalida el que el usuario ya tiene.
      return generated.kind === "created"
        ? { status: "issued", url: generated.url }
        : { status: "reused" };
    },
    async logout(channel: ChatChannel, contactId: string): Promise<void> {
      await logoutChat.execute({ channel, contactId });
    },
  };

  return { chatIdentity, sessions };
}
