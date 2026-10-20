import type { Request, RequestHandler, Response } from "express";
import type { SessionService } from "../application/session-service.js";
import type { AdminRole } from "../domain/admin-auth-repository.js";
import { readSessionToken } from "./session-cookie.js";

declare global {
  namespace Express {
    interface Request {
      /** Autenticado por el middleware de sesión; ausente si no hay sesión válida. */
      principal?: {
        adminId: string;
        email: string;
        role: AdminRole;
      };
    }
  }
}

export const UNAUTHENTICATED_ERROR = {
  code: "UNAUTHENTICATED",
  message: "No hay una sesión válida",
} as const;

export const FORBIDDEN_ERROR = {
  code: "FORBIDDEN",
  message: "No tienes permisos para acceder a este recurso",
} as const;

/**
 * Excepciones del guard de /api, además de GET /api/health:
 * el login del chat es público (el cliente final no tiene sesión de administrador).
 * Montado en "/api", Express recorta el prefijo: req.path es "/health", "/identity/...".
 */
export function isPublicApiRequest(req: Request): boolean {
  if (req.method === "GET" && req.path === "/health") return true;
  if (req.path === "/identity/login") return true;
  if (req.method === "GET" && req.path.startsWith("/identity/login-link/")) return true;
  return false;
}

/**
 * Exige una sesión de administrador válida para cualquier petición a /api/*.
 * Repite la misma validación que GET /auth/me (SessionService.validate) y deja el
 * principal en `req.principal`. Una sesión vencida se borra en la BD como en /auth/me.
 */
export function createRequireSession(sessions: SessionService): RequestHandler {
  return async (req: Request, res: Response, next) => {
    if (isPublicApiRequest(req)) {
      next();
      return;
    }
    const token = readSessionToken(req);
    const principal = token === null ? null : await sessions.validate(token);
    if (!principal) {
      res.status(401).json({ error: UNAUTHENTICATED_ERROR });
      return;
    }
    req.principal = principal;
    next();
  };
}

/** Exige que el rol autenticado esté en la lista permitida. Debe ir tras el guard de sesión. */
export function requireRole(...allowed: AdminRole[]): RequestHandler {
  return (req: Request, res: Response, next) => {
    const principal = req.principal;
    if (!principal) {
      res.status(401).json({ error: UNAUTHENTICATED_ERROR });
      return;
    }
    if (!allowed.includes(principal.role)) {
      res.status(403).json({ error: FORBIDDEN_ERROR });
      return;
    }
    next();
  };
}