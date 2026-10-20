import { AppError, NotFoundError } from "../../../../shared/errors/app.error.js";
import type { Ticket } from "../../domain/entities/ticket.js";
import type { TicketRepository } from "../../domain/repositories/ticket-repository.js";

export class AssignTicketUseCase {
  constructor(private readonly repository: TicketRepository) {}

  async execute(ticketId: string, agentId: string | null): Promise<Ticket> {
    const ticket = await this.repository.findById(ticketId);
    if (!ticket) throw new NotFoundError("Ticket no encontrado", "TICKET_NOT_FOUND");
    if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") {
      throw new AppError(
        "TICKET_NOT_ASSIGNABLE",
        "No se puede asignar un ticket resuelto o cerrado",
        409,
      );
    }
    const updated = await this.repository.assign(ticketId, agentId);
    if (!updated) throw new NotFoundError("Ticket no encontrado", "TICKET_NOT_FOUND");
    return updated;
  }
}
