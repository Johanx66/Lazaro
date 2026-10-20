import type { Request, Response } from "express";
import type { LoginUseCase } from "../application/use-cases/login.js";
import type { SessionService } from "../application/session-service.js";
import { parseLoginBody } from "../application/validation.js";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "./session-cookie.js";

export interface AuthControllerDeps {
  login: LoginUseCase;
  sessions: SessionService;
  secureCookies: boolean;
}

export class AuthController {
  constructor(private readonly deps: AuthControllerDeps) {}

  async login(req: Request, res: Response): Promise<void> {
    const input = parseLoginBody(req.body);
    const result = await this.deps.login.execute({
      email: input.email,
      password: input.password,
      ip: req.ip ?? req.socket.remoteAddress ?? "unknown",
    });
    setSessionCookie(res, result.sessionToken, this.deps.secureCookies);
    // Solo email y rol: nunca hash, token ni id.
    res.status(200).json({ email: result.email, role: result.role });
  }

  async logout(req: Request, res: Response): Promise<void> {
    const token = readSessionToken(req);
    if (token !== null) {
      await this.deps.sessions.destroy(token);
    }
    clearSessionCookie(res, this.deps.secureCookies);
    res.status(204).end();
  }

  async me(req: Request, res: Response): Promise<void> {
    const token = readSessionToken(req);
    const principal = token === null ? null : await this.deps.sessions.validate(token);
    if (!principal) {
      clearSessionCookie(res, this.deps.secureCookies);
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "No hay una sesión válida" } });
      return;
    }
    res.json({ email: principal.email, role: principal.role });
  }
}
