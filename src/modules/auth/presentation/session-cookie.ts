import type { CookieOptions, Request, Response } from "express";
import { SESSION_ABSOLUTE_TIMEOUT_MS } from "../application/session-policy.js";

export const SESSION_COOKIE_NAME = "chatbot_session";

/**
 * Atributos de la cookie de sesión: httpOnly, SameSite=Strict, Path=/ y sin Domain
 * (solo el host que la emitió). `secure` solo en producción (en desarrollo se sirve por http).
 */
function baseOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: "strict", secure, path: "/" };
}

export function setSessionCookie(res: Response, token: string, secure: boolean): void {
  res.cookie(SESSION_COOKIE_NAME, token, { ...baseOptions(secure), maxAge: SESSION_ABSOLUTE_TIMEOUT_MS });
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  res.clearCookie(SESSION_COOKIE_NAME, baseOptions(secure));
}

/** Lee el token de la cabecera Cookie (sin dependencias extra). null si no hay. */
export function readSessionToken(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== SESSION_COOKIE_NAME) continue;
    const value = part.slice(separator + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}
