import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;
// 32 bytes en base64url sin relleno = 43 caracteres.
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

/** Token de sesión: 32 bytes aleatorios en base64url. Solo viaja en la cookie. */
export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Lo único que se guarda en la BD: el hash SHA-256 (hex) del token. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isWellFormedSessionToken(token: string): boolean {
  return TOKEN_FORMAT.test(token);
}
