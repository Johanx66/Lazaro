import type { Express, Router } from "express";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { PasswordHasher } from "../../shared/domain/password-hasher.js";
import { rateLimit } from "../../shared/http/rate-limit.js";
import { Argon2PasswordHasher } from "../../shared/infrastructure/argon2-password-hasher.js";
import { createFillerHash } from "./application/filler-hash.js";
import { LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS } from "./application/session-policy.js";
import { SessionService } from "./application/session-service.js";
import { LoginUseCase } from "./application/use-cases/login.js";
import type { AdminAuthRepository, AuthLogger, Clock } from "./domain/admin-auth-repository.js";
import { ConsoleAuthLogger } from "./infrastructure/console-auth-logger.js";
import { PrismaAdminAuthRepository } from "./infrastructure/prisma-admin-auth-repository.js";
import { AuthController } from "./presentation/auth-controller.js";
import { authRoutes } from "./presentation/auth-routes.js";

export interface AuthRouterOptions {
  repository: AdminAuthRepository;
  hasher: PasswordHasher;
  /** Cookie Secure: solo en producción. */
  secureCookies: boolean;
  clock?: Clock;
  logger?: AuthLogger;
}

const systemClock: Clock = { now: () => new Date() };

export interface AuthServices {
  router: Router;
  sessions: SessionService;
}

export function createAuthServices(options: AuthRouterOptions): AuthServices {
  const clock = options.clock ?? systemClock;
  const sessions = new SessionService({ repository: options.repository, clock });
  const login = new LoginUseCase({
    repository: options.repository,
    hasher: options.hasher,
    sessions,
    clock,
    logger: options.logger ?? new ConsoleAuthLogger(),
    fillerHash: createFillerHash(options.hasher),
  });
  const controller = new AuthController({ login, sessions, secureCookies: options.secureCookies });
  const loginRateLimit = rateLimit({
    windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
    max: LOGIN_RATE_LIMIT_MAX,
    message: "Demasiados intentos de inicio de sesión. Inténtalo de nuevo en un minuto.",
  });
  return { router: authRoutes(controller, loginRateLimit), sessions };
}

export function createAuthRouter(options: AuthRouterOptions): Router {
  return createAuthServices(options).router;
}

export function wireAuth(app: Express, db: PrismaClient, options: { secureCookies: boolean }): SessionService {
  const { router, sessions } = createAuthServices({
    repository: new PrismaAdminAuthRepository(db),
    hasher: new Argon2PasswordHasher(),
    secureCookies: options.secureCookies,
  });
  app.use("/auth", router);
  return sessions;
}
