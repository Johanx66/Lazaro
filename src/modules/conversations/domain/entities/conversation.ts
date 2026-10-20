export type ConversationStatus =
  | "OPEN"
  | "BOT_HANDLING"
  | "WAITING_USER"
  | "WAITING_AGENT"
  | "RESOLVED"
  | "CLOSED";

export type SenderType = "USER" | "BOT" | "AGENT" | "SYSTEM";

export type ConversationEventType =
  | "CONVERSATION_CREATED"
  | "MESSAGE_RECEIVED"
  | "MESSAGE_SENT"
  | "BOT_RESPONSE"
  | "TICKET_CREATED"
  | "TRANSFERRED_TO_HUMAN"
  | "AGENT_ASSIGNED"
  | "CONVERSATION_RESOLVED"
  | "CONVERSATION_CLOSED";

export interface Conversation {
  id: string;
  userId: string;
  channel: string;
  status: ConversationStatus;
  assignedAgentId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  senderType: SenderType;
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface ConversationState {
  status: ConversationStatus;
  assignedAgentId: string | null;
}

export interface StartConversationInput {
  userId: string;
  channel: string;
}

export interface SendMessageInput {
  conversationId: string;
  userId: string;
  content: string;
}

export interface HandleNonTextEventInput {
  conversationId: string;
  eventType: string;
}