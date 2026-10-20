import type { AuthLogger, LoginFailureLog } from "../domain/admin-auth-repository.js";

/**
 * Registra los fallos de login como una línea JSON de nivel warn. Solo escribe los campos
 * de `LoginFailureLog` (motivo, IP, id interno): nunca contraseña, hash, token ni email.
 */
export class ConsoleAuthLogger implements AuthLogger {
  loginFailed(entry: LoginFailureLog): void {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "login fallido",
        reason: entry.reason,
        ip: entry.ip,
        ...(entry.adminId !== undefined ? { adminId: entry.adminId } : {}),
        ...(entry.lockedNow ? { lockedNow: true } : {}),
      }),
    );
  }
}
