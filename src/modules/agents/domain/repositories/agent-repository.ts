import type { Agent, AgentStatus } from "../entities/agent.js";

export interface AgentRepository {
  findById(id: string): Promise<Agent | null>;
  /** El asesor se vincula con AdminUser por email (AdminUser.email == Agent.email). */
  findByEmail(email: string): Promise<Agent | null>;
  listAvailable(): Promise<Agent[]>;
  setStatus(id: string, status: AgentStatus): Promise<Agent | null>;
  /** Tickets abiertos (no RESOLVED/CLOSED) asignados al asesor. */
  countOpenTickets(agentId: string): Promise<number>;
}
