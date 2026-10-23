import { describe, expect, it, vi } from "vitest";
import { TransferToHumanUseCase } from "../application/use-cases/transfer-to-human.js";
import type {
  AddEventData,
  AddMessageData,
  ConversationRepository,
  UpdateConversationData,
} from "../domain/repositories/conversation-repository.js";
import type { Conversation } from "../domain/entities/conversation.js";
import type { Agent } from "../../agents/domain/entities/agent.js";
import type { Ticket } from "../../tickets/domain/entities/ticket.js";
import type { CreateTicketUseCase } from "../../tickets/application/use-cases/create-ticket.js";
import type { AssignTicketUseCase } from "../../tickets/application/use-cases/assign-ticket.js";
import type { PickAvailableAgentUseCase } from "../../agents/application/use-cases/pick-available-agent.js";
import { NotFoundError } from "../../../shared/errors/app.error.js";

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "c1",
    userId: "u1",
    channel: "WEB",
    status: "BOT_HANDLING",
    assignedAgentId: null,
    startedAt: new Date(),
    endedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const agent = (overrides: Partial<Agent> = {}): Agent => ({
  id: "a1",
  name: "Ana Asesora",
  email: "ana@example.com",
  status: "AVAILABLE",
  createdAt: new Date(),
  ...overrides,
});

function ticketFor(conversationId: string): Ticket {
  return {
    id: "t1",
    conversationId,
    userId: "u1",
    subject: "Transferencia a agente humano",
    description: "Razón: HUMAN_REQUEST. Último mensaje: quiero un humano",
    priority: "MEDIUM",
    status: "OPEN",
    assignedAgentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeRepo(initial: Conversation) {
  const store = new Map<string, Conversation>([[initial.id, initial]]);
  const events: AddEventData[] = [];
  const messages: AddMessageData[] = [];
  const repo: ConversationRepository = {
    create: async () => initial,
    findById: async (id) => store.get(id) ?? null,
    findActiveByUserIdAndChannel: async () => null,
    findWaitingForAgent: async () => [...store.values()].filter((conversation) =>
      conversation.status === "WAITING_AGENT" || (conversation.status === "OPEN" && conversation.assignedAgentId !== null),
    ),
    findClosed: async () => [],
    update: async (id, data: UpdateConversationData) => {
      const current = store.get(id);
      if (!current) return null;
      const updated: Conversation = {
        ...current,
        status: data.status,
        assignedAgentId: data.assignedAgentId !== undefined ? data.assignedAgentId : current.assignedAgentId,
        updatedAt: new Date(),
      };
      store.set(id, updated);
      return updated;
    },
    addMessage: async (data) => {
      messages.push(data);
      return {
        id: `m${messages.length}`,
        conversationId: data.conversationId,
        senderType: data.senderType,
        content: data.content,
        metadata: data.metadata ?? null,
        createdAt: new Date(),
      };
    },
    recordEvent: async (data) => void events.push(data),
    listMessages: async () => [],
    hasAgentMessage: async () => false,
  };
  return { repo, store, events, messages };
}

function build(
  repo: ConversationRepository,
  availableAgent: Agent | null = agent(),
) {
  const createTicket: Pick<CreateTicketUseCase, "execute"> = {
    execute: async () => ticketFor("c1"),
  };
  const assignTicket: Pick<AssignTicketUseCase, "execute"> = {
    execute: async (ticketId, agentId) => {
      const ticket = ticketFor("c1");
      ticket.assignedAgentId = agentId;
      return ticket;
    },
  };
  const pickAvailableAgent: Pick<PickAvailableAgentUseCase, "execute"> = {
    execute: async () => availableAgent,
  };
  const useCase = new TransferToHumanUseCase(
    repo,
    createTicket as CreateTicketUseCase,
    assignTicket as AssignTicketUseCase,
    pickAvailableAgent as PickAvailableAgentUseCase,
  );
  return useCase;
}

const input = {
  conversationId: "c1",
  userId: "u1",
  userPhone: "570000000001",
  userName: "Ana",
  lastCustomerMessage: "quiero un humano",
  reason: "HUMAN_REQUEST" as const,
};

describe("TransferToHumanUseCase", () => {
  it("crea el ticket, asigna al agente disponible y pasa la conversación a OPEN", async () => {
    const { repo, store, events } = makeRepo(makeConversation());
    const result = await build(repo, agent()).execute(input);

    expect(result).toMatchObject({
      conversationId: "c1",
      ticketId: "t1",
      assignedAgentId: "a1",
      status: "OPEN",
      messageToCustomer: "Un agente te atenderá en breve.",
    });
    expect(store.get("c1")?.status).toBe("OPEN");
    expect(store.get("c1")?.assignedAgentId).toBe("a1");
    expect(events.map((e) => e.type)).toEqual(["TICKET_CREATED", "AGENT_ASSIGNED"]);
  });

  it("sin agentes disponibles deja el ticket en cola y la conversación en WAITING_AGENT", async () => {
    const { repo, store, events } = makeRepo(makeConversation());
    const result = await build(repo, null).execute(input);

    expect(result).toMatchObject({
      assignedAgentId: null,
      status: "WAITING_AGENT",
      messageToCustomer: "Todos los agentes están ocupados. Tu solicitud está en cola y te atenderán en orden de llegada.",
    });
    expect(store.get("c1")?.status).toBe("WAITING_AGENT");
    expect(events.map((e) => e.type)).toEqual(["TICKET_CREATED", "TRANSFERRED_TO_HUMAN"]);
  });

  it("retransfiere desde OPEN, limpia la asignación anterior y deja la conversación visible en el panel", async () => {
    const initial = makeConversation({ status: "OPEN", assignedAgentId: "a1" });
    const { repo, store, events } = makeRepo(initial);
    const createTicket = { execute: vi.fn(async () => ticketFor("c1")) };
    const assignTicket = { execute: async (_ticketId: string, _agentId: string | null) => ticketFor("c1") };
    const pickAvailableAgent = { execute: async () => null };
    const useCase = new TransferToHumanUseCase(
      repo,
      createTicket as unknown as CreateTicketUseCase,
      assignTicket as unknown as AssignTicketUseCase,
      pickAvailableAgent as unknown as PickAvailableAgentUseCase,
    );
    const result = await useCase.execute(input);
    const panelConversations = await repo.findWaitingForAgent();

    expect(result.ticketId).toBe("t1");
    expect(createTicket.execute).toHaveBeenCalledOnce();
    expect(result.status).toBe("WAITING_AGENT");
    expect(store.get("c1")).toMatchObject({ status: "WAITING_AGENT", assignedAgentId: null });
    expect(panelConversations.map(({ id }) => id)).toContain("c1");
    expect(events[0]?.type).toBe("TICKET_CREATED");
  });

  it("acepta transferencias por confianza baja o por muchos fallos", async () => {
    for (const reason of ["LOW_CONFIDENCE", "MAX_MISSES"] as const) {
      const { repo } = makeRepo(makeConversation());
      const result = await build(repo, null).execute({ ...input, reason });
      expect(result.status).toBe("WAITING_AGENT");
    }
  });

  it("lanza NotFound si la conversación no existe", async () => {
    const { repo, store } = makeRepo(makeConversation());
    store.clear();
    const useCase = build(repo);
    await expect(useCase.execute({ ...input, conversationId: "c-x" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lanza NotFound si el mensaje no pertenece al usuario de la conversación", async () => {
    const { repo } = makeRepo(makeConversation({ userId: "otro" }));
    const useCase = build(repo);
    await expect(useCase.execute(input)).rejects.toBeInstanceOf(NotFoundError);
  });
});
