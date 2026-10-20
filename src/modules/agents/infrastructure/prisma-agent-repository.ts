import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { Agent, AgentStatus } from "../domain/entities/agent.js";
import type { AgentRepository } from "../domain/repositories/agent-repository.js";

export class PrismaAgentRepository implements AgentRepository {
  constructor(private readonly db: PrismaClient) {}

  async findById(id: string): Promise<Agent | null> {
    const agent = await this.db.agent.findUnique({ where: { id } });
    return agent ? this.toDomain(agent) : null;
  }

  async findByEmail(email: string): Promise<Agent | null> {
    const agent = await this.db.agent.findUnique({ where: { email } });
    return agent ? this.toDomain(agent) : null;
  }

  async listAvailable(): Promise<Agent[]> {
    const agents = await this.db.agent.findMany({
      where: { status: "AVAILABLE" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return agents.map((agent) => this.toDomain(agent));
  }

  async setStatus(id: string, status: AgentStatus): Promise<Agent | null> {
    const existing = await this.db.agent.findUnique({ where: { id } });
    if (!existing) return null;
    const agent = await this.db.agent.update({ where: { id }, data: { status } });
    return this.toDomain(agent);
  }

  async countOpenTickets(agentId: string): Promise<number> {
    return this.db.ticket.count({
      where: { assignedAgentId: agentId, status: { notIn: ["RESOLVED", "CLOSED"] } },
    });
  }

  private toDomain(agent: {
    id: string;
    name: string;
    email: string;
    status: AgentStatus;
    createdAt: Date;
  }): Agent {
    return {
      id: agent.id,
      name: agent.name,
      email: agent.email,
      status: agent.status,
      createdAt: agent.createdAt,
    };
  }
}
