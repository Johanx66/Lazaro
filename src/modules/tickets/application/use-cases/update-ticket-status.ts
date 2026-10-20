import { AppError, NotFoundError } from "../../../../shared/errors/app.error.js";
import type { Ticket, TicketStatus } from "../../domain/entities/ticket.js";
import type { TicketRepository } from "../../domain/repositories/ticket-repository.js";

const ALLOWED: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ["IN_PROGRESS", "WAITING_USER", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["OPEN", "WAITING_USER", "RESOLVED", "CLOSED"],
  WAITING_USER: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED"],
  CLOSED: [],
};

export class UpdateTicketStatusUseCase {
  constructor(private readonly repository: TicketRepository) {}

  async execute(ticketId: string, status: TicketStatus): Promise<Ticket> {
    const ticket = await this.repository.findById(ticketId);
    if (!ticket) throw new NotFoundError("Ticket no encontrado", "TICKET_NOT_FOUND");
    if (!ALLOWED[ticket.status].includes(status)) {
      throw new AppError(
        "INVALID_TICKET_TRANSITION",
        `No se puede pasar el ticket de ${ticket.status} a ${status}`,
        409,
      );
    }
    const updated = await this.repository.updateStatus(ticketId, status);
    if (!updated) throw new NotFoundError("Ticket no encontrado", "TICKET_NOT_FOUND");
    return updated;
  }
}
