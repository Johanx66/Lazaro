import type { PrismaClient } from "../../generated/prisma/client.js";
import { PrismaTicketRepository } from "./infrastructure/prisma-ticket-repository.js";
import { AssignTicketUseCase } from "./application/use-cases/assign-ticket.js";
import { CreateTicketUseCase } from "./application/use-cases/create-ticket.js";
import { UpdateTicketStatusUseCase } from "./application/use-cases/update-ticket-status.js";

export function wireTickets(db: PrismaClient) {
  const repository = new PrismaTicketRepository(db);
  return {
    repository,
    createTicket: new CreateTicketUseCase(repository),
    assignTicket: new AssignTicketUseCase(repository),
    updateTicketStatus: new UpdateTicketStatusUseCase(repository),
  };
}
