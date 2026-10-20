import { NotFoundError, ValidationError } from "../../../../shared/errors/app.error.js";
import type {
  ConversationStatus,
  HandleNonTextEventInput,
  Message,
} from "../../domain/entities/conversation.js";
import type { ConversationRepository } from "../../domain/repositories/conversation-repository.js";
import { transition, type ConversationDomainEventType } from "../../domain/state-machine.js";
import { validateHandleNonTextEvent } from "../validation.js";

export const NON_TEXT_EVENT_MAP: Record<string, ConversationDomainEventType> = {
  MEDIA: "MESSAGE_RECEIVED",
  AUDIO: "MESSAGE_RECEIVED",
  IMAGE: "MESSAGE_RECEIVED",
  VIDEO: "MESSAGE_RECEIVED",
  LOCATION: "MESSAGE_RECEIVED",
  LINK_PREVIEW: "MESSAGE_RECEIVED",
  INTENT_NOT_RECOGNIZED: "TRANSFERRED_TO_HUMAN",
};

export interface HandleNonTextEventResult {
  conversationId: string;
  appliedEvent: ConversationDomainEventType;
  status: ConversationStatus;
  message: Message;
}

export class HandleNonTextEventUseCase {
  constructor(private readonly repository: ConversationRepository) {}

  async execute(input: HandleNonTextEventInput): Promise<HandleNonTextEventResult> {
    const valid = validateHandleNonTextEvent(input);

    const appliedEvent = NON_TEXT_EVENT_MAP[valid.eventType.toUpperCase()];
    if (!appliedEvent) {
      throw new ValidationError(`El evento "${valid.eventType}" no está soportado`);
    }

    const conversation = await this.repository.findById(valid.conversationId);
    if (!conversation) {
      throw new NotFoundError("Conversación no encontrada");
    }

    const next = transition(
      { status: conversation.status, assignedAgentId: conversation.assignedAgentId },
      { type: appliedEvent },
    );

    const message = await this.repository.addMessage({
      conversationId: conversation.id,
      senderType: "SYSTEM",
      content: `evento no textual recibido: ${valid.eventType}`,
      metadata: { eventType: valid.eventType, appliedEvent },
    });

    await this.repository.update(conversation.id, { status: next.status });

    return { conversationId: conversation.id, appliedEvent, status: next.status, message };
  }
}