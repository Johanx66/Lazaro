export type AdminRole = "ADMIN" | "AGENT";

export interface AdminAccount {
  id: string;
  email: string;
  passwordHash: string;
  role: AdminRole;
  active: boolean;
  failedAttempts: number;
  lockedUntil: Date | null;
}

export interface AdminSessionRecord {
  id: string;
  adminUserId: string;
  tokenHash: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
}

export interface SessionOwner {
  id: string;
  email: string;
  role: AdminRole;
  active: boolean;
}

export interface SessionWithOwner {
  session: AdminSessionRecord;
  owner: SessionOwner;
}

export interface CreateSessionInput {
  adminUserId: string;
  tokenHash: string;
  now: Date;
  expiresAt: Date;
}

/** Puerto de persistencia de administradores y sus sesiones. */
export interface AdminAuthRepository {
  /** `email` ya viene normalizado (minúsculas, sin espacios). */
  findAdminByEmail(email: string): Promise<AdminAccount | null>;
  /** Incrementa de forma atómica y devuelve el nuevo valor de failedAttempts. */
  incrementFailedAttempts(adminId: string): Promise<number>;
  lockUntil(adminId: string, until: Date): Promise<void>;
  /** failedAttempts = 0 y lockedUntil = null. */
  resetFailedAttempts(adminId: string): Promise<void>;
  createSession(input: CreateSessionInput): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionWithOwner | null>;
  touchSession(sessionId: string, now: Date): Promise<void>;
  /** Idempotente: no falla si la sesión no existe. */
  deleteSessionByTokenHash(tokenHash: string): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export type LoginFailureReason = "unknown_user" | "inactive_user" | "locked" | "wrong_password";

export interface LoginFailureLog {
  reason: LoginFailureReason;
  ip: string;
  /** Id interno del administrador (nunca el email). Ausente si el usuario no existe. */
  adminId?: string;
  /** true si este fallo provocó el bloqueo temporal. */
  lockedNow?: boolean;
}

/** Puerto de registro de eventos de autenticación. Nunca recibe contraseñas, hashes, tokens ni emails. */
export interface AuthLogger {
  loginFailed(entry: LoginFailureLog): void;
}
