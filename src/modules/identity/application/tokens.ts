import { createHash, randomBytes } from "node:crypto";
import { TOKEN_BYTES } from "./policy.js";

/** Token opaco: 32 bytes aleatorios en base64url. Solo viaja en el enlace o por el chat. */
export function generateOpaqueToken(bytes: number = TOKEN_BYTES): string {
  return randomBytes(bytes).toString("base64url");
}

/** Lo único que se guarda en la BD: el hash SHA-256 (hex) del token. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// 32 bytes en base64url sin relleno = 43 caracteres.
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export function isWellFormedToken(token: string): boolean {
  return TOKEN_FORMAT.test(token);
}
