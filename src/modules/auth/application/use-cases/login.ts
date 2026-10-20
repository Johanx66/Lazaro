import type { PasswordHasher } from "../../../../shared/domain/password-hasher.js";
import { AppError } from "../../../../shared/errors/app.error.js";
import type {
  AdminAccount,
  AdminAuthRepository,
  AdminRole,
  AuthLogger,
  Clock,
  LoginFailureReason,
} from "../../domain/admin-auth-repository.js";
import type { SessionService } from "../session-service.js";
import {
  ACCOUNT_LOCK_DURATION_MS,
  INVALID_CREDENTIALS_MESSAGE,
  MAX_FAILED_LOGIN_ATTEMPTS,
} from "../session-policy.js";

export interface LoginCommand {
  /** Ya normalizado (minúsculas, sin espacios) por la validación de entrada. */
  email: string;
  password: string;
  ip: string;
}

export interface LoginResult {
  email: string;
  role: AdminRole;
  /** Token en claro para la cookie. No debe salir en el cuerpo de la respuesta ni en logs. */
  sessionToken: string;
  sessionExpiresAt: Date;
}

/** Error único para todos los fallos de login: no revela si el usuario existe. */
export class InvalidCredentialsError extends AppError {
  constructor() {
    super("INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE, 401);
  }
}

export interface LoginDeps {
  repository: AdminAuthRepository;
  hasher: PasswordHasher;
  sessions: SessionService;
  clock: Clock;
  logger: AuthLogger;
  /** Hash argon2id de relleno (generado al arrancar) para igualar tiempos si el usuario no existe. */
  fillerHash: Promise<string>;
}

export class LoginUseCase {
  constructor(private readonly deps: LoginDeps) {}

  async execute(command: LoginCommand): Promise<LoginResult> {
    const { repository, hasher, sessions, clock, logger } = this.deps;

    const admin = await repository.findAdminByEmail(command.email);

    // Siempre se ejecuta exactamente un verify (contra el hash real o contra el de relleno),
    // exista, esté activo o bloqueado el usuario, para que el tiempo de respuesta no delate nada.
    const hashToCheck = admin ? admin.passwordHash : await this.deps.fillerHash;
    const passwordMatches = await hasher.verify(hashToCheck, command.password);

    const now = clock.now();
    const reject = (reason: LoginFailureReason, extra: { lockedNow?: boolean } = {}): never => {
      logger.loginFailed({
        reason,
        ip: command.ip,
        ...(admin ? { adminId: admin.id } : {}),
        ...extra,
      });
      throw new InvalidCredentialsError();
    };

    if (!admin) return reject("unknown_user");
    if (!admin.active) return reject("inactive_user");
    if (admin.lockedUntil !== null && admin.lockedUntil.getTime() > now.getTime()) {
      return reject("locked");
    }

    if (!passwordMatches) {
      const lockedNow = await this.registerFailure(admin, now);
      return reject("wrong_password", { lockedNow });
    }

    await repository.resetFailedAttempts(admin.id);
    const session = await sessions.create(admin.id);
    return {
      email: admin.email,
      role: admin.role,
      sessionToken: session.token,
      sessionExpiresAt: session.expiresAt,
    };
  }

  /** Suma un fallo (atómico en la BD) y bloquea la cuenta al llegar al máximo. Devuelve si bloqueó. */
  private async registerFailure(admin: AdminAccount, now: Date): Promise<boolean> {
    const { repository } = this.deps;

    // Si el bloqueo anterior ya venció, se empieza de cero: 5 intentos nuevos.
    if (admin.lockedUntil !== null) {
      await repository.resetFailedAttempts(admin.id);
    }

    const failedAttempts = await repository.incrementFailedAttempts(admin.id);
    if (failedAttempts < MAX_FAILED_LOGIN_ATTEMPTS) return false;

    await repository.lockUntil(admin.id, new Date(now.getTime() + ACCOUNT_LOCK_DURATION_MS));
    return true;
  }
}
