import type { Agent } from "../../domain/entities/agent.js";
import type { AgentRepository } from "../../domain/repositories/agent-repository.js";

export class PickAvailableAgentUseCase {
  constructor(private readonly repository: AgentRepository) {}

  /** Entre los AVAILABLE, el de menos tickets abiertos; null si no hay. */
  async execute(): Promise<Agent | null> {
    const available = await this.repository.listAvailable();
    let best: Agent | null = null;
    let bestLoad = Infinity;
    for (const agent of available) {
      const load = await this.repository.countOpenTickets(agent.id);
      if (load < bestLoad) {
        best = agent;
        bestLoad = load;
      }
    }
    return best;
  }
}
