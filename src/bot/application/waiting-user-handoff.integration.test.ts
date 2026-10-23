import { describe, expect, it, vi } from "vitest";
import type { Conversation, ConversationStatus, Message } from "../../modules/conversations/domain/entities/conversation.js";
import type { ConversationRepository } from "../../modules/conversations/domain/repositories/conversation-repository.js";
import type { Ticket } from "../../modules/tickets/domain/entities/ticket.js";
import type { CreateTicketUseCase } from "../../modules/tickets/application/use-cases/create-ticket.js";
import type { AssignTicketUseCase } from "../../modules/tickets/application/use-cases/assign-ticket.js";
import type { PickAvailableAgentUseCase } from "../../modules/agents/application/use-cases/pick-available-agent.js";
import { AddBotReplyUseCase } from "../../modules/conversations/application/use-cases/add-bot-reply.js";
import { SendMessageUseCase } from "../../modules/conversations/application/use-cases/send-message.js";
import { TransferToHumanUseCase } from "../../modules/conversations/application/use-cases/transfer-to-human.js";
import { ProcessIncomingMessageUseCase } from "./process-incoming-message.js";

function setup(initialStatus: ConversationStatus, ragEnabled: boolean) {
  let conversation: Conversation = {
    id: "conversation-1", userId: "user-1", channel: "TELEGRAM", status: initialStatus,
    assignedAgentId: null, startedAt: new Date(), endedAt: null, createdAt: new Date(), updatedAt: new Date(),
  };
  const messages: Message[] = [];
  const events: string[] = [];
  const tickets: Ticket[] = [];
  const repo: ConversationRepository = {
    create: async () => conversation,
    findById: async (id) => id === conversation.id ? conversation : null,
    findActiveByUserIdAndChannel: async () => conversation,
    findWaitingForAgent: async () => conversation.status === "WAITING_AGENT" || (conversation.status === "OPEN" && conversation.assignedAgentId !== null) ? [conversation] : [],
    findClosed: async () => [],
    update: async (_id, data) => {
      conversation = { ...conversation, ...data, updatedAt: new Date() };
      return conversation;
    },
    addMessage: async (data) => {
      const message: Message = { id: `message-${messages.length + 1}`, ...data, metadata: data.metadata ?? null, createdAt: new Date() };
      messages.push(message);
      return message;
    },
    recordEvent: async ({ type }) => { events.push(type); },
    listMessages: async () => messages,
    hasAgentMessage: async () => messages.some(({ senderType }) => senderType === "AGENT"),
  };
  const createTicket = { execute: vi.fn(async () => {
    const ticket: Ticket = {
      id: `ticket-${tickets.length + 1}`, conversationId: conversation.id, userId: conversation.userId,
      subject: "Transferencia a agente humano", description: "Prueba", priority: "MEDIUM", status: "OPEN",
      assignedAgentId: null, createdAt: new Date(), updatedAt: new Date(),
    };
    tickets.push(ticket);
    return ticket;
  }) };
  const assignTicket = { execute: async (ticketId: string, agentId: string | null) => {
    const ticket = tickets.find(({ id }) => id === ticketId);
    if (!ticket) throw new Error("ticket faltante en prueba");
    ticket.assignedAgentId = agentId;
    return ticket;
  } };
  const transfer = new TransferToHumanUseCase(
    repo,
    createTicket as unknown as CreateTicketUseCase,
    assignTicket as unknown as AssignTicketUseCase,
    { execute: async () => null } as unknown as PickAvailableAgentUseCase,
  );
  const sendMessage = new SendMessageUseCase(repo);
  const addBotReply = new AddBotReplyUseCase(repo);
  const processor = new ProcessIncomingMessageUseCase({
    users: { findOrCreateUser: async () => ({ id: "user-1" }) },
    conversations: {
      startConversation: async () => conversation,
      sendMessage: (input) => sendMessage.execute(input),
      recordBotReply: (id, content) => addBotReply.execute(id, content),
      handleNonTextEvent: async () => { throw new Error("no esperado"); },
      transferToHuman: (input) => transfer.execute(input),
    },
    knowledge: { findAnswer: async () => null },
    rag: ragEnabled ? {
      find: async () => ({ entry: {
        id: "urgent", category: "PQRS", topic: "urgencia", intent: "ayuda", question: "ayuda", variations: [], keywords: [],
        answer: "Te comunicaré con un asesor.", answerAfterRegistration: null, priority: "alta", escalationMode: "inmediato",
        escalationReason: null, requiredData: [], suggestedActions: [], confirmationQuestion: null, tool: null,
      }, score: 0.9, secondScore: 0.1, ambiguous: false }),
      getEntry: () => null,
    } as never : undefined,
    ragEnabled,
    transferAfterMisses: 3,
    identity: {
      getActiveSessionName: async () => "Ana",
      getActivePrincipal: async () => ({ companyUserId: "user-1", displayName: "Ana", role: "USER", companyCustomerId: "USR_101" }),
      startLogin: async () => ({ status: "issued", url: "https://example.test/login" }),
      logout: async () => undefined,
    },
  } as never);
  return { processor, repo, conversation: () => conversation, tickets, events, createTicket };
}

describe("transferencias desde WAITING_USER", () => {
  it("RAG inmediato crea ticket y deja el caso visible en el panel", async () => {
    const state = setup("WAITING_USER", true);
    const result = await state.processor.execute({ channel: "TELEGRAM", contactId: "570000000001", name: "Ana", text: "riesgo urgente" });

    expect(state.createTicket.execute).toHaveBeenCalledOnce();
    expect(state.tickets).toHaveLength(1);
    expect(result.status).toBe("WAITING_AGENT");
    expect(state.conversation().status).toBe("WAITING_AGENT");
    expect((await state.repo.findWaitingForAgent()).map(({ id }) => id)).toContain("conversation-1");
  });

  it("callback menu:asesor crea ticket y deja el caso visible en el panel", async () => {
    const state = setup("WAITING_USER", false);
    const result = await state.processor.execute({ channel: "TELEGRAM", contactId: "570000000001", name: "Ana", text: "menu:asesor" });

    expect(state.createTicket.execute).toHaveBeenCalledOnce();
    expect(state.tickets).toHaveLength(1);
    expect(result.status).toBe("WAITING_AGENT");
    expect(state.conversation().status).toBe("WAITING_AGENT");
    expect((await state.repo.findWaitingForAgent()).map(({ id }) => id)).toContain("conversation-1");
  });
});
