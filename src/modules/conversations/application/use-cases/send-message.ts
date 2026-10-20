import { NotFoundError } from "../../../../shared/errors/app.error.js";
import type {
  ConversationStatus,
  Message,
  SendMessageInput,
} from "../../domain/entities/conversation.js";
import type { ConversationRepository } from "../../domain/repositories/conversation-repository.js";
import { transition } from "../../domain/state-machine.js";
import { validateSendMessage } from "../validation.js";

export interface SendMessageResult {
  conversationId: string;
  message: Message;
  status: ConversationStatus;
}

export class SendMessageUseCase {
  constructor(private readonly repository: ConversationRepository) {}

  async execute(input: SendMessageInput): Promise<SendMessageResult> {
    const valid = validateSendMessage(input);

    const conversation = await this.repository.findById(valid.conversationId);
    if (!conversation || conversation.userId !== valid.userId) {
      throw new NotFoundError("Conversación no encontrada");
    }

    const next = transition(
      { status: conversation.status, assignedAgentId: conversation.assignedAgentId },
      { type: "MESSAGE_RECEIVED" },
    );

    const message = await this.repository.addMessage({
      conversationId: conversation.id,
      senderType: "USER",
      content: valid.content,
    });

    await this.repository.update(conversation.id, {
      status: next.status,
      ...(next.status === "CLOSED" ? { endedAt: new Date() } : {}),
    });

    return { conversationId: conversation.id, message, status: next.status };
  }
}