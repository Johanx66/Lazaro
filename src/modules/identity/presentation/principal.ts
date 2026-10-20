import type { Request } from "express";
import { AppError } from "../../../shared/errors/app.error.js";

/**
 * Id del administrador autenticado. El guard de sesión + requireRole ya garantizan
 * que existe; aquí se vuelve a comprobar para no depender de ello.
 */
export function requireAdminId(req: Request): string {
  const adminId = req.principal?.adminId;
  if (!adminId) {
    throw new AppError("UNAUTHENTICATED", "No hay una sesión válida", 401);
  }
  return adminId;
}

export function clientIp(req: Request): string | null {
  return req.ip ?? req.socket.remoteAddress ?? null;
}
