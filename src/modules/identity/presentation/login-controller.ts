import type { Request, Response } from "express";
import { param } from "../../../shared/http/request.js";
import { InvalidLoginLinkError } from "../application/errors.js";
import type { ChatLoginUseCase } from "../application/use-cases/chat-login.js";
import type { ValidateLoginLinkUseCase } from "../application/use-cases/validate-login-link.js";
import { parseChatLoginBody } from "../application/validation.js";

export interface LoginControllerDeps {
  validateLink: ValidateLoginLinkUseCase;
  chatLogin: ChatLoginUseCase;
}

export class LoginController {
  constructor(private readonly deps: LoginControllerDeps) {}

  /** GET /api/identity/login-link/:token — valida el enlace sin consumirlo. */
  async validateLink(req: Request, res: Response): Promise<void> {
    const result = await this.deps.validateLink.execute(param(req, "token"));
    if (!result) throw new InvalidLoginLinkError();
    // Nunca se devuelve el contacto completo: solo los últimos 4 caracteres.
    res.json({ maskedContact: result.maskedContact, channel: result.channel });
  }

  /** POST /api/identity/login — consume el enlace y crea la sesión de chat. */
  async login(req: Request, res: Response): Promise<void> {
    const input = parseChatLoginBody(req.body);
    const result = await this.deps.chatLogin.execute({
      username: input.username,
      password: input.password,
      token: input.token,
      ip: req.ip ?? req.socket.remoteAddress ?? "unknown",
    });
    res.status(200).json({ displayName: result.displayName, role: result.role });
  }
}
