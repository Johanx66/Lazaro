import { requireString } from "../../../shared/http/request.js";
import type { StartConversationInput } from "../domain/entities/conversation.js";

export function toStartConversationInput(body: Record<string, unknown>): StartConversationInput {
  return {
    userId: requireString(body, "userId"),
    channel: requireString(body, "channel"),
  };
}

export function toSendMessageBody(body: Record<string, unknown>): {
  userId: string;
  content: string;
} {
  return {
    userId: requireString(body, "userId"),
    content: requireString(body, "content"),
  };
}

export function toHandleNonTextEventBody(body: Record<string, unknown>): {
  eventType: string;
} {
  return {
    eventType: requireString(body, "eventType"),
  };
}