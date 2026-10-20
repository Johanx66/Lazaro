const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Inactividad máxima: la sesión vence a los 30 min desde lastSeenAt (deslizante). */
export const SESSION_IDLE_TIMEOUT_MS = 30 * MINUTE_MS;

/** Tope absoluto: la sesión vence a las 12 h desde createdAt, aunque haya actividad. */
export const SESSION_ABSOLUTE_TIMEOUT_MS = 12 * HOUR_MS;

/** Contraseñas incorrectas seguidas que provocan el bloqueo temporal. */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;

/** Duración del bloqueo temporal de la cuenta. */
export const ACCOUNT_LOCK_DURATION_MS = 15 * MINUTE_MS;

/** Rate-limit por IP en POST /auth/login: 10 intentos por minuto. */
export const LOGIN_RATE_LIMIT_WINDOW_MS = MINUTE_MS;
export const LOGIN_RATE_LIMIT_MAX = 10;

export const INVALID_CREDENTIALS_MESSAGE = "Usuario o contraseña incorrectos";
