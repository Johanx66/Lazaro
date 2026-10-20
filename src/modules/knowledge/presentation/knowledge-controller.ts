import type { Request, Response } from "express";
import { param } from "../../../shared/http/request.js";
import type { CreateKnowledgeUseCase } from "../application/use-cases/create-knowledge.js";
import type { GetKnowledgeUseCase } from "../application/use-cases/get-knowledge.js";
import type { ListKnowledgeUseCase } from "../application/use-cases/list-knowledge.js";
import type { UpdateKnowledgeUseCase } from "../application/use-cases/update-knowledge.js";
import { toCreateKnowledgeInput, toUpdateKnowledgeInput } from "./knowledge-dtos.js";

export interface KnowledgeControllerDeps {
  create: CreateKnowledgeUseCase;
  list: ListKnowledgeUseCase;
  get: GetKnowledgeUseCase;
  update: UpdateKnowledgeUseCase;
}

export class KnowledgeController {
  constructor(private readonly deps: KnowledgeControllerDeps) {}

  async list(req: Request, res: Response): Promise<void> {
    const page = await this.deps.list.execute(req.query as Record<string, unknown>);
    res.json(page);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const article = await this.deps.get.execute(param(req, "id"));
    res.json(article);
  }

  async create(req: Request, res: Response): Promise<void> {
    const input = toCreateKnowledgeInput((req.body ?? {}) as Record<string, unknown>);
    const article = await this.deps.create.execute(input);
    res.status(201).json(article);
  }

  async update(req: Request, res: Response): Promise<void> {
    const input = toUpdateKnowledgeInput((req.body ?? {}) as Record<string, unknown>);
    const article = await this.deps.update.execute(param(req, "id"), input);
    res.json(article);
  }
}