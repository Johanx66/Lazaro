import { ValidationError } from "../../../shared/errors/app.error.js";
import type {
  HandleNonTextEventInput,
  SendMessageInput,
  StartConversationInput,
} from "../domain/entities/conversation.js";

const MAX_MESSAGE_LENGTH = 4096;

export function validateStartConversation(input: StartConversationInput): StartConversationInput {
  const userId = input.userId.trim();
  const channel = input.channel.trim();
  if (userId.length === 0) {
    throw new ValidationError("El identificador del usuario (userId) es obligatorio");
  }
  if (channel.length === 0) {
    throw new ValidationError("El canal es obligatorio");
  }
  return { userId, channel };
}

export function validateSendMessage(input: SendMessageInput): SendMessageInput {
  const conversationId = input.conversationId.trim();
  const userId = input.userId.trim();
  const content = input.content.trim();
  if (conversationId.length === 0) {
    throw new ValidationError("El identificador de la conversación es obligatorio");
  }
  if (userId.length === 0) {
    throw new ValidationError("El identificador del usuario (userId) es obligatorio");
  }
  if (content.length === 0) {
    throw new ValidationError("El mensaje no puede estar vacío");
  }
  if (content.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError(`El mensaje no puede superar los ${MAX_MESSAGE_LENGTH} caracteres`);
  }
  return { conversationId, userId, content };
}

export function validateHandleNonTextEvent(input: HandleNonTextEventInput): HandleNonTextEventInput {
  const conversationId = input.conversationId.trim();
  const eventType = input.eventType.trim();
  if (conversationId.length === 0) {
    throw new ValidationError("El identificador de la conversación es obligatorio");
  }
  if (eventType.length === 0) {
    throw new ValidationError("El tipo de evento es obligatorio");
  }
  return { conversationId, eventType };
}

export function validateBotMessage(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    throw new ValidationError("El contenido de la respuesta es obligatorio");
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError(`El mensaje no puede superar los ${MAX_MESSAGE_LENGTH} caracteres`);
  }
  return trimmed;
}