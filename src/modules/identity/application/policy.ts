const MINUTE_MS = 60_000;

/** Token del enlace de login y del id de sesión de chat: 32 bytes base64url (43 caracteres). */
export const TOKEN_BYTES = 32;

/** Contraseñas incorrectas seguidas que provocan el bloqueo temporal. */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;

/** Duración del bloqueo temporal de la cuenta. */
export const ACCOUNT_LOCK_DURATION_MS = 15 * MINUTE_MS;

/** Rate-limit por IP en POST /api/identity/login: 10 intentos por minuto. */
export const LOGIN_RATE_LIMIT_WINDOW_MS = MINUTE_MS;
export const LOGIN_RATE_LIMIT_MAX = 10;

/** Mensaje único para todos los fallos de login: no revela si el usuario o el enlace existen. */
export const INVALID_CREDENTIALS_MESSAGE = "No se pudo iniciar sesión";

/** Enlace inválido, vencido o ya usado. */
export const INVALID_LINK_MESSAGE = "El enlace de acceso no es válido, ya venció o ya se usó";

export function loginLinkTtlMs(minutes: number): number {
  return minutes * MINUTE_MS;
}

export function chatSessionIdleMs(minutes: number): number {
  return minutes * MINUTE_MS;
}

export function chatSessionAbsoluteMs(hours: number): number {
  return hours * 60 * MINUTE_MS;
}
