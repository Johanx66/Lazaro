import { describe, expect, it } from "vitest";
import type { Agent } from "../../../../src/modules/agents/domain/entities/agent.js";
import type { AgentRepository } from "../../../../src/modules/agents/domain/repositories/agent-repository.js";
import { PickAvailableAgentUseCase } from "../../../../src/modules/agents/application/use-cases/pick-available-agent.js";

const agent = (id: string, status: Agent["status"] = "AVAILABLE"): Agent => ({
  id,
  name: id,
  email: `${id}@example.com`,
  status,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
});

function makeRepository(agents: Agent[], load: Record<string, number>): AgentRepository {
  return {
    async findById(id) {
      return agents.find((a) => a.id === id) ?? null;
    },
    async findByEmail(email) {
      return agents.find((a) => a.email === email) ?? null;
    },
    async listAvailable() {
      return agents.filter((a) => a.status === "AVAILABLE");
    },
    async setStatus(id, status) {
      const a = agents.find((x) => x.id === id);
      if (!a) return null;
      a.status = status;
      return a;
    },
    async countOpenTickets(id) {
      return load[id] ?? 0;
    },
  };
}

describe("PickAvailableAgentUseCase", () => {
  it("elige al disponible con menos tickets abiertos", async () => {
    const repo = makeRepository([agent("a1"), agent("a2"), agent("a3")], { a1: 3, a2: 1, a3: 2 });
    expect((await new PickAvailableAgentUseCase(repo).execute())?.id).toBe("a2");
  });

  it("ignora a los no disponibles aunque tengan menos carga", async () => {
    const repo = makeRepository([agent("a1"), agent("a2", "BUSY")], { a1: 5, a2: 0 });
    expect((await new PickAvailableAgentUseCase(repo).execute())?.id).toBe("a1");
  });

  it("devuelve null si nadie está disponible", async () => {
    const repo = makeRepository([agent("a1", "OFFLINE"), agent("a2", "BUSY")], {});
    expect(await new PickAvailableAgentUseCase(repo).execute()).toBeNull();
  });
});
