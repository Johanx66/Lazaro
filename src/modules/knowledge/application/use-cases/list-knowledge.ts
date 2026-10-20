import type { KnowledgePage } from "../../domain/entities/knowledge-article.js";
import type { KnowledgeRepository } from "../../domain/repositories/knowledge-repository.js";
import { validateListPage, type RawListQuery } from "../validation.js";

export class ListKnowledgeUseCase {
  constructor(private readonly repository: KnowledgeRepository) {}

  async execute(query: RawListQuery): Promise<KnowledgePage> {
    const valid = validateListPage(query);
    return this.repository.listPage(valid);
  }
}
