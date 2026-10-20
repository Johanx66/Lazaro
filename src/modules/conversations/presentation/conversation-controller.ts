import type { Request, Response } from "express";
import { param } from "../../../shared/http/request.js";
import type { GetConversationUseCase } from "../application/use-cases/get-conversation.js";
import type { HandleNonTextEventUseCase } from "../application/use-cases/handle-non-text-event.js";
import type { SendMessageUseCase } from "../application/use-cases/send-message.js";
import type { StartConversationUseCase } from "../application/use-cases/start-conversation.js";
import {
  toHandleNonTextEventBody,
  toSendMessageBody,
  toStartConversationInput,
} from "./conversation-dtos.js";

export interface ConversationControllerDeps {
  startConversation: StartConversationUseCase;
  getConversation: GetConversationUseCase;
  sendMessage: SendMessageUseCase;
  handleNonTextEvent: HandleNonTextEventUseCase;
}

export class ConversationController {
  constructor(private readonly deps: ConversationControllerDeps) {}

  async start(req: Request, res: Response): Promise<void> {
    const input = toStartConversationInput((req.body ?? {}) as Record<string, unknown>);
    const conversation = await this.deps.startConversation.execute(input);
    res.status(201).json(conversation);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const conversation = await this.deps.getConversation.execute(param(req, "id"));
    res.json(conversation);
  }

  async sendMessage(req: Request, res: Response): Promise<void> {
    const body = toSendMessageBody((req.body ?? {}) as Record<string, unknown>);
    const result = await this.deps.sendMessage.execute({
      conversationId: param(req, "id"),
      ...body,
    });
    res.status(201).json(result);
  }

  async handleNonTextEvent(req: Request, res: Response): Promise<void> {
    const { eventType } = toHandleNonTextEventBody((req.body ?? {}) as Record<string, unknown>);
    const result = await this.deps.handleNonTextEvent.execute({
      conversationId: param(req, "id"),
      eventType,
    });
    res.json(result);
  }
}