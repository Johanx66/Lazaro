export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "WAITING_USER" | "RESOLVED" | "CLOSED";

export interface Ticket {
  id: string;
  conversationId: string;
  userId: string;
  subject: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  assignedAgentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTicketInput {
  conversationId: string;
  userId: string;
  subject: string;
  description: string;
  priority?: TicketPriority;
}
