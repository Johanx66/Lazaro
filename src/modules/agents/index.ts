import type { PrismaClient } from "../../generated/prisma/client.js";
import { PrismaAgentRepository } from "./infrastructure/prisma-agent-repository.js";
import { PickAvailableAgentUseCase } from "./application/use-cases/pick-available-agent.js";

export function wireAgents(db: PrismaClient) {
  const repository = new PrismaAgentRepository(db);
  return {
    repository,
    pickAvailableAgent: new PickAvailableAgentUseCase(repository),
  };
}
