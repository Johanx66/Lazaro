export interface ProcessIncomingMessageResult {
  conversationId: string;
  reply: string | null;
  handledByBot: boolean;
  status: import("../../modules/conversations/domain/entities/conversation.js").ConversationStatus;
}

export interface MessageProcessor {
  execute(inbound: import("../../channels/domain/channel-adapter.js").InboundMessage): Promise<ProcessIncomingMessageResult>;
}