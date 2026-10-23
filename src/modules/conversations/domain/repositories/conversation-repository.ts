import type {
  Conversation,
  ConversationEventType,
  ConversationStatus,
  Message,
  SenderType,
  StartConversationInput,
} from "../entities/conversation.js";

export interface CreateConversationData extends StartConversationInput {
  status: ConversationStatus;
  assignedAgentId: string | null;
}

export interface AddMessageData {
  conversationId: string;
  senderType: SenderType;
  content: string;
  metadata?: Record<string, unknown> | null;
}

export interface AddEventData {
  conversationId: string;
  type: ConversationEventType;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateConversationData {
  status: ConversationStatus;
  endedAt?: Date | null;
  assignedAgentId?: string | null;
}

export const MAX_MESSAGES_PAGE = 200;

export interface MessageCursor {
  createdAt: Date;
  id: string;
}

export interface ListMessagesOptions {
  limit: number;
  /** Devuelve solo mensajes anteriores a este cursor. */
  before?: MessageCursor;
  /** Devuelve solo mensajes posteriores a este cursor. */
  after?: MessageCursor;
}

/** Limita el tamaño de página a [1, MAX_MESSAGES_PAGE]. */
export function clampMessagesLimit(limit: number): number {
  if (!Number.isFinite(limit)) return MAX_MESSAGES_PAGE;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_MESSAGES_PAGE);
}

export interface ConversationRepository {
  create(data: CreateConversationData): Promise<Conversation>;
  findById(id: string): Promise<Conversation | null>;
  findActiveByUserIdAndChannel(userId: string, channel: string): Promise<Conversation | null>;
  /** Conversaciones en WAITING_AGENT u OPEN con agente asignado. */
  findWaitingForAgent(): Promise<Conversation[]>;
  /** Conversaciones finalizadas (RESOLVED o CLOSED), más recientes primero. */
  findClosed(): Promise<Conversation[]>;
  update(id: string, data: UpdateConversationData): Promise<Conversation | null>;
  addMessage(data: AddMessageData): Promise<Message>;
  /** Registra un evento de la conversación para auditoría. */
  recordEvent(data: AddEventData): Promise<void>;
  /** Mensajes en orden cronológico ascendente, limitados y opcionalmente por cursor. */
  listMessages(conversationId: string, options: ListMessagesOptions): Promise<Message[]>;
  hasAgentMessage(conversationId: string): Promise<boolean>;
}
