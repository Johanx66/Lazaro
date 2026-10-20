import type { Request, Response } from "express";
import { param } from "../../../shared/http/request.js";
import type { ListChatSessionsUseCase } from "../application/use-cases/list-chat-sessions.js";
import type { RevokeChatSessionUseCase } from "../application/use-cases/revoke-chat-session.js";
import { clientIp, requireAdminId } from "./principal.js";

export interface ChatSessionControllerDeps {
  listChatSessions: ListChatSessionsUseCase;
  revokeChatSession: RevokeChatSessionUseCase;
}

export class ChatSessionController {
  constructor(private readonly deps: ChatSessionControllerDeps) {}

  async list(_req: Request, res: Response): Promise<void> {
    res.json(await this.deps.listChatSessions.execute());
  }

  async revoke(req: Request, res: Response): Promise<void> {
    await this.deps.revokeChatSession.execute({
      id: param(req, "id"),
      adminId: requireAdminId(req),
      ip: clientIp(req),
    });
    res.status(204).end();
  }
}
