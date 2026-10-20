import { NotFoundError } from "../../../../shared/errors/app.error.js";
import type { ConversationStatus, Message } from "../../domain/entities/conversation.js";
import type { ConversationRepository } from "../../domain/repositories/conversation-repository.js";
import { transition } from "../../domain/state-machine.js";
import { validateBotMessage } from "../validation.js";

export interface BotReplyResult {
  conversationId: string;
  message: Message;
  status: ConversationStatus;
}

export class AddBotReplyUseCase {
  constructor(private readonly repository: ConversationRepository) {}

  async execute(conversationId: string, content: string): Promise<BotReplyResult> {
    const valid = validateBotMessage(content);

    const conversation = await this.repository.findById(conversationId);
    if (!conversation) {
      throw new NotFoundError("Conversación no encontrada");
    }

    const next = transition(
      { status: conversation.status, assignedAgentId: conversation.assignedAgentId },
      { type: "BOT_RESPONSE" },
    );

    const message = await this.repository.addMessage({
      conversationId: conversation.id,
      senderType: "BOT",
      content: valid,
    });

    await this.repository.update(conversation.id, { status: next.status });

    return { conversationId: conversation.id, message, status: next.status };
  }
}