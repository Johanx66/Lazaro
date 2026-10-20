import { NotFoundError } from "../../../../shared/errors/app.error.js";
import type { Conversation, ConversationStatus } from "../../domain/entities/conversation.js";
import type { ConversationRepository } from "../../domain/repositories/conversation-repository.js";
import type { TicketRepository } from "../../../tickets/domain/repositories/ticket-repository.js";
import type { AgentRepository } from "../../../agents/domain/repositories/agent-repository.js";
import { transition } from "../../domain/state-machine.js";
import { CreateTicketUseCase } from "../../../tickets/application/use-cases/create-ticket.js";
import { AssignTicketUseCase } from "../../../tickets/application/use-cases/assign-ticket.js";
import { PickAvailableAgentUseCase } from "../../../agents/application/use-cases/pick-available-agent.js";

export interface TransferToHumanInput {
  conversationId: string;
  userId: string;
  userPhone: string | null;
  userName: string | null;
  lastCustomerMessage: string;
  reason: "HUMAN_REQUEST" | "LOW_CONFIDENCE" | "MAX_MISSES";
}

export interface TransferToHumanResult {
  conversationId: string;
  ticketId: string;
  assignedAgentId: string | null;
  status: ConversationStatus;
  messageToCustomer: string;
}

export class TransferToHumanUseCase {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly createTicket: CreateTicketUseCase,
    private readonly assignTicket: AssignTicketUseCase,
    private readonly pickAvailableAgent: PickAvailableAgentUseCase,
  ) {}

  async execute(input: TransferToHumanInput): Promise<TransferToHumanResult> {
    const conversation = await this.conversationRepository.findById(input.conversationId);
    if (!conversation || conversation.userId !== input.userId) {
      throw new NotFoundError("Conversación no encontrada");
    }

    const ticket = await this.createTicket.execute({
      conversationId: input.conversationId,
      userId: input.userId,
      subject: "Transferencia a agente humano",
      description: `Razón: ${input.reason}. Último mensaje: ${input.lastCustomerMessage}`,
    });

    await this.conversationRepository.recordEvent({
      conversationId: input.conversationId,
      type: "TICKET_CREATED",
      metadata: { ticketId: ticket.id, reason: input.reason },
    });
    await this.conversationRepository.addMessage({
      conversationId: input.conversationId,
      senderType: "SYSTEM",
      content: `Ticket creado: ${ticket.id}`,
      metadata: { eventType: "TICKET_CREATED", ticketId: ticket.id },
    });

    const nextState = transition(
      { status: conversation.status, assignedAgentId: conversation.assignedAgentId },
      { type: "TICKET_CREATED" },
    );
    await this.conversationRepository.update(input.conversationId, { status: nextState.status });

    const agent = await this.pickAvailableAgent.execute();
    let assignedAgentId: string | null = null;
    if (agent) {
      const assignedTicket = await this.assignTicket.execute(ticket.id, agent.id);
      assignedAgentId = assignedTicket.assignedAgentId;
      await this.conversationRepository.recordEvent({
        conversationId: input.conversationId,
        type: "AGENT_ASSIGNED",
        metadata: { agentId: agent.id, agentName: agent.name },
      });
      await this.conversationRepository.addMessage({
        conversationId: input.conversationId,
        senderType: "SYSTEM",
        content: `Agente asignado: ${agent.name} (${agent.email})`,
        metadata: { eventType: "AGENT_ASSIGNED", agentId: agent.id, agentName: agent.name },
      });
      await this.conversationRepository.update(input.conversationId, {
        status: "OPEN",
        assignedAgentId: agent.id,
      });
    } else {
      await this.conversationRepository.recordEvent({
        conversationId: input.conversationId,
        type: "TRANSFERRED_TO_HUMAN",
        metadata: { reason: input.reason, queued: true },
      });
      await this.conversationRepository.addMessage({
        conversationId: input.conversationId,
        senderType: "SYSTEM",
        content: "No hay agentes disponibles. Ticket en cola.",
        metadata: { eventType: "TRANSFERRED_TO_HUMAN" },
      });
      const waitingState = transition(
        { status: conversation.status, assignedAgentId: conversation.assignedAgentId },
        { type: "TRANSFERRED_TO_HUMAN" },
      );
      await this.conversationRepository.update(input.conversationId, { status: waitingState.status });
    }

    const messageToCustomer =
      assignedAgentId !== null
        ? "Un agente te atenderá en breve."
        : "Todos los agentes están ocupados. Tu solicitud está en cola y te atenderán en orden de llegada.";

    const finalConversation = await this.conversationRepository.findById(input.conversationId);
    return {
      conversationId: input.conversationId,
      ticketId: ticket.id,
      assignedAgentId,
      status: finalConversation?.status ?? "WAITING_AGENT",
      messageToCustomer,
    };
  }
}