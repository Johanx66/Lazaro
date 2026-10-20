import { NotFoundError } from "../../../../shared/errors/app.error.js";
import type { KnowledgeArticle } from "../../domain/entities/knowledge-article.js";
import type { KnowledgeRepository } from "../../domain/repositories/knowledge-repository.js";

export class GetKnowledgeUseCase {
  constructor(private readonly repository: KnowledgeRepository) {}

  async execute(id: string): Promise<KnowledgeArticle> {
    const article = await this.repository.findById(id);
    if (!article) {
      throw new NotFoundError("Artículo de conocimiento no encontrado");
    }
    return article;
  }
}