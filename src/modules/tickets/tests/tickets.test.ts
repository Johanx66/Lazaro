import { describe, expect, it } from "vitest";
import type { CreateTicketInput, Ticket } from "../../../../src/modules/tickets/domain/entities/ticket.js";
import type { TicketRepository } from "../../../../src/modules/tickets/domain/repositories/ticket-repository.js";
import { CreateTicketUseCase } from "../../../../src/modules/tickets/application/use-cases/create-ticket.js";
import { AssignTicketUseCase } from "../../../../src/modules/tickets/application/use-cases/assign-ticket.js";
import { UpdateTicketStatusUseCase } from "../../../../src/modules/tickets/application/use-cases/update-ticket-status.js";
import { ValidationError } from "../../../../src/shared/errors/app.error.js";

function makeRepository(): TicketRepository & { store: Map<string, Ticket> } {
  const store = new Map<string, Ticket>();
  let seq = 0;
  return {
    store,
    async create(input: CreateTicketInput) {
      seq += 1;
      const ticket: Ticket = {
        id: `t${seq}`,
        conversationId: input.conversationId,
        userId: input.userId,
        subject: input.subject,
        description: input.description,
        priority: input.priority ?? "MEDIUM",
        status: "OPEN",
        assignedAgentId: null,
        createdAt: new Date(2026, 0, 1, 0, 0, seq),
        updatedAt: new Date(2026, 0, 1, 0, 0, seq),
      };
      store.set(ticket.id, ticket);
      return ticket;
    },
    async findById(id) {
      return store.get(id) ?? null;
    },
    async findOpenByConversationId(conversationId) {
      return (
        [...store.values()].find(
          (t) =>
            t.conversationId === conversationId &&
            t.status !== "RESOLVED" &&
            t.status !== "CLOSED",
        ) ?? null
      );
    },
    async assign(id, agentId) {
      const t = store.get(id);
      if (!t) return null;
      t.assignedAgentId = agentId;
      return t;
    },
    async updateStatus(id, status) {
      const t = store.get(id);
      if (!t) return null;
      t.status = status;
      return t;
    },
    async listQueue() {
      return [...store.values()]
        .filter((t) => t.status === "OPEN" && t.assignedAgentId === null)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },
  };
}

const input = (conversationId: string): CreateTicketInput => ({
  conversationId,
  userId: "u1",
  subject: "Necesito ayuda",
  description: "El bot no entendió mi consulta",
});

describe("CreateTicketUseCase", () => {
  it("es idempotente por conversación abierta", async () => {
    const repo = makeRepository();
    const uc = new CreateTicketUseCase(repo);
    const a = await uc.execute(input("c1"));
    const b = await uc.execute(input("c1"));
    expect(b.id).toBe(a.id);
    expect(repo.store.size).toBe(1);
  });

  it("crea uno nuevo si el anterior está cerrado", async () => {
    const repo = makeRepository();
    const uc = new CreateTicketUseCase(repo);
    const a = await uc.execute(input("c1"));
    repo.store.get(a.id)!.status = "CLOSED";
    const b = await uc.execute(input("c1"));
    expect(b.id).not.toBe(a.id);
  });

  it("rechaza asunto de más de 200 caracteres y descripción vacía", async () => {
    const uc = new CreateTicketUseCase(makeRepository());
    await expect(uc.execute({ ...input("c1"), subject: "x".repeat(201) })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(uc.execute({ ...input("c1"), description: "  " })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("cola de tickets", () => {
  it("lista OPEN sin asignar, más antiguos primero", async () => {
    const repo = makeRepository();
    const create = new CreateTicketUseCase(repo);
    const assign = new AssignTicketUseCase(repo);
    const t1 = await create.execute(input("c1"));
    const t2 = await create.execute(input("c2"));
    const t3 = await create.execute(input("c3"));
    await assign.execute(t2.id, "a1");
    const queue = await repo.listQueue();
    expect(queue.map((t) => t.id)).toEqual([t1.id, t3.id]);
  });
});

describe("UpdateTicketStatusUseCase", () => {
  it("permite OPEN → RESOLVED → CLOSED", async () => {
    const repo = makeRepository();
    const t = await new CreateTicketUseCase(repo).execute(input("c1"));
    const uc = new UpdateTicketStatusUseCase(repo);
    expect((await uc.execute(t.id, "RESOLVED")).status).toBe("RESOLVED");
    expect((await uc.execute(t.id, "CLOSED")).status).toBe("CLOSED");
  });

  it("transiciones inválidas → 409", async () => {
    const repo = makeRepository();
    const t = await new CreateTicketUseCase(repo).execute(input("c1"));
    const uc = new UpdateTicketStatusUseCase(repo);
    await uc.execute(t.id, "CLOSED");
    for (const status of ["OPEN", "RESOLVED", "IN_PROGRESS"] as const) {
      await expect(uc.execute(t.id, status)).rejects.toMatchObject({
        statusCode: 409,
        code: "INVALID_TICKET_TRANSITION",
      });
    }
  });

  it("asignar un ticket cerrado → 409", async () => {
    const repo = makeRepository();
    const t = await new CreateTicketUseCase(repo).execute(input("c1"));
    await new UpdateTicketStatusUseCase(repo).execute(t.id, "CLOSED");
    await expect(new AssignTicketUseCase(repo).execute(t.id, "a1")).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
