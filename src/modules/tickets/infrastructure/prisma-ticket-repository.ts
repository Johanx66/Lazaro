import type { PrismaClient } from "../../../generated/prisma/client.js";
import type {
  CreateTicketInput,
  Ticket,
  TicketPriority,
  TicketStatus,
} from "../domain/entities/ticket.js";
import type { TicketRepository } from "../domain/repositories/ticket-repository.js";

interface TicketRow {
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

export class PrismaTicketRepository implements TicketRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(input: CreateTicketInput): Promise<Ticket> {
    const ticket = await this.db.ticket.create({
      data: {
        conversationId: input.conversationId,
        userId: input.userId,
        subject: input.subject,
        description: input.description,
        ...(input.priority ? { priority: input.priority } : {}),
      },
    });
    return this.toDomain(ticket);
  }

  async findById(id: string): Promise<Ticket | null> {
    const ticket = await this.db.ticket.findUnique({ where: { id } });
    return ticket ? this.toDomain(ticket) : null;
  }

  async findOpenByConversationId(conversationId: string): Promise<Ticket | null> {
    const ticket = await this.db.ticket.findFirst({
      where: { conversationId, status: { notIn: ["RESOLVED", "CLOSED"] } },
      orderBy: { createdAt: "desc" },
    });
    return ticket ? this.toDomain(ticket) : null;
  }

  async assign(ticketId: string, agentId: string | null): Promise<Ticket | null> {
    const existing = await this.db.ticket.findUnique({ where: { id: ticketId } });
    if (!existing) return null;
    const ticket = await this.db.ticket.update({
      where: { id: ticketId },
      data: { assignedAgentId: agentId },
    });
    return this.toDomain(ticket);
  }

  async updateStatus(ticketId: string, status: TicketStatus): Promise<Ticket | null> {
    const existing = await this.db.ticket.findUnique({ where: { id: ticketId } });
    if (!existing) return null;
    const ticket = await this.db.ticket.update({ where: { id: ticketId }, data: { status } });
    return this.toDomain(ticket);
  }

  async listQueue(): Promise<Ticket[]> {
    const tickets = await this.db.ticket.findMany({
      where: { status: "OPEN", assignedAgentId: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return tickets.map((ticket) => this.toDomain(ticket));
  }

  private toDomain(ticket: TicketRow): Ticket {
    return {
      id: ticket.id,
      conversationId: ticket.conversationId,
      userId: ticket.userId,
      subject: ticket.subject,
      description: ticket.description,
      priority: ticket.priority,
      status: ticket.status,
      assignedAgentId: ticket.assignedAgentId,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    };
  }
}
