import type { CreateTicketInput, Ticket, TicketStatus } from "../entities/ticket.js";

export interface TicketRepository {
  create(input: CreateTicketInput): Promise<Ticket>;
  findById(id: string): Promise<Ticket | null>;
  /** Ticket no cerrado ni resuelto de la conversación, si existe. */
  findOpenByConversationId(conversationId: string): Promise<Ticket | null>;
  assign(ticketId: string, agentId: string | null): Promise<Ticket | null>;
  updateStatus(ticketId: string, status: TicketStatus): Promise<Ticket | null>;
  /** Tickets OPEN sin asignar, más antiguos primero. */
  listQueue(): Promise<Ticket[]>;
}
