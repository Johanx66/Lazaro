import type { Express } from "express";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { CreateKnowledgeUseCase } from "./application/use-cases/create-knowledge.js";
import { GetKnowledgeUseCase } from "./application/use-cases/get-knowledge.js";
import { ListKnowledgeUseCase } from "./application/use-cases/list-knowledge.js";
import { UpdateKnowledgeUseCase } from "./application/use-cases/update-knowledge.js";
import { PrismaKnowledgeRepository } from "./infrastructure/prisma-knowledge-repository.js";
import { KnowledgeController } from "./presentation/knowledge-controller.js";
import { knowledgeRoutes } from "./presentation/knowledge-routes.js";

export function wireKnowledge(app: Express, db: PrismaClient): void {
  const repository = new PrismaKnowledgeRepository(db);
  const controller = new KnowledgeController({
    create: new CreateKnowledgeUseCase(repository),
    list: new ListKnowledgeUseCase(repository),
    get: new GetKnowledgeUseCase(repository),
    update: new UpdateKnowledgeUseCase(repository),
  });
  app.use("/api/knowledge", knowledgeRoutes(controller));
}