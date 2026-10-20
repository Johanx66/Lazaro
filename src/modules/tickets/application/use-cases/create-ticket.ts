import type { CreateTicketInput, Ticket } from "../../domain/entities/ticket.js";
import type { TicketRepository } from "../../domain/repositories/ticket-repository.js";
import { validateCreateTicket } from "../validation.js";

export class CreateTicketUseCase {
  constructor(private readonly repository: TicketRepository) {}

  /** Idempotente: si la conversación ya tiene un ticket abierto, lo devuelve. */
  async execute(input: CreateTicketInput): Promise<Ticket> {
    const valid = validateCreateTicket(input);
    const existing = await this.repository.findOpenByConversationId(valid.conversationId);
    if (existing) return existing;
    return this.repository.create(valid);
  }
}
