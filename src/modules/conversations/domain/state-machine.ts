import { AppError } from "../../../shared/errors/app.error.js";
import type { ConversationState, ConversationStatus } from "./entities/conversation.js";

export type ConversationDomainEventType =
  | "CONVERSATION_CREATED"
  | "MESSAGE_RECEIVED"
  | "MESSAGE_SENT"
  | "BOT_RESPONSE"
  | "TICKET_CREATED"
  | "TRANSFERRED_TO_HUMAN"
  | "AGENT_ASSIGNED"
  | "RETURNED_TO_BOT"
  | "CONVERSATION_RESOLVED"
  | "CONVERSATION_CLOSED"
  | "INTENT_NOT_RECOGNIZED";

export type { ConversationStatus, ConversationState };

export interface ConversationDomainEvent {
  readonly type: ConversationDomainEventType;
}

export const INITIAL_STATUS: ConversationStatus = "CLOSED";

export const ALL_STATUSES: readonly ConversationStatus[] = [
  "OPEN",
  "BOT_HANDLING",
  "WAITING_USER",
  "WAITING_AGENT",
  "RESOLVED",
  "CLOSED",
];

export const TERMINAL_STATUSES: readonly ConversationStatus[] = ["RESOLVED", "CLOSED"];

export function isTerminalStatus(status: ConversationStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export const TRANSITIONS: Record<
  ConversationStatus,
  Partial<Record<ConversationDomainEventType, ConversationStatus>>
> = {
  OPEN: {
    MESSAGE_SENT: "WAITING_USER",
    BOT_RESPONSE: "WAITING_USER",
    MESSAGE_RECEIVED: "OPEN",
    RETURNED_TO_BOT: "BOT_HANDLING",
    CONVERSATION_RESOLVED: "RESOLVED",
    CONVERSATION_CLOSED: "CLOSED",
  },
  BOT_HANDLING: {
    MESSAGE_RECEIVED: "BOT_HANDLING",
    BOT_RESPONSE: "WAITING_USER",
    TICKET_CREATED: "WAITING_AGENT",
    TRANSFERRED_TO_HUMAN: "WAITING_AGENT",
    CONVERSATION_RESOLVED: "RESOLVED",
  },
  WAITING_USER: {
    MESSAGE_RECEIVED: "BOT_HANDLING",
    CONVERSATION_RESOLVED: "RESOLVED",
  },
  WAITING_AGENT: {
    MESSAGE_RECEIVED: "WAITING_AGENT",
    AGENT_ASSIGNED: "OPEN",
    RETURNED_TO_BOT: "BOT_HANDLING",
    CONVERSATION_RESOLVED: "RESOLVED",
    CONVERSATION_CLOSED: "CLOSED",
  },
  RESOLVED: {
    MESSAGE_RECEIVED: "BOT_HANDLING",
    CONVERSATION_CLOSED: "CLOSED",
  },
  CLOSED: {
    MESSAGE_RECEIVED: "BOT_HANDLING",
  },
};

export function canTransition(
  status: ConversationStatus,
  eventType: ConversationDomainEventType,
): boolean {
  return TRANSITIONS[status]?.[eventType] !== undefined;
}

export function initialConversationState(): ConversationState {
  return { status: INITIAL_STATUS, assignedAgentId: null };
}

export class InvalidTransitionError extends AppError {
  constructor(current: ConversationStatus, eventType: ConversationDomainEventType) {
    super("INVALID_TRANSITION", `Transición inválida de "${current}" con evento "${eventType}"`, 409);
    this.name = "InvalidTransitionError";
  }
}

export function transition(state: ConversationState, event: ConversationDomainEvent): ConversationState {
  const target = TRANSITIONS[state.status]?.[event.type];
  if (target === undefined) {
    throw new InvalidTransitionError(state.status, event.type);
  }
  return { status: target, assignedAgentId: state.assignedAgentId };
}