import type { CreateKnowledgeInput, KnowledgeArticle } from "../../domain/entities/knowledge-article.js";
import type { KnowledgeRepository } from "../../domain/repositories/knowledge-repository.js";
import { validateCreate } from "../validation.js";

export class CreateKnowledgeUseCase {
  constructor(private readonly repository: KnowledgeRepository) {}

  async execute(input: CreateKnowledgeInput): Promise<KnowledgeArticle> {
    const valid = validateCreate(input);
    return this.repository.create(valid);
  }
}