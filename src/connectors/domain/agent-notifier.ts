export interface EscalatedConversation {
  conversationId: string;
  userPhone: string | null;
  userName: string | null;
  lastCustomerMessage: string;
  escalatedAt: Date;
}

export type NotificationStatus = "sent" | "skipped" | "failed";

export interface NotificationChannelResult {
  channel: string;
  status: NotificationStatus;
  detail: string;
}

export interface AgentNotifier {
  notify(conversation: EscalatedConversation): Promise<NotificationChannelResult[]>;
}