import { NotFoundError } from "../../../../shared/errors/app.error.js";
import type {
  KnowledgeArticle,
  UpdateKnowledgeInput,
} from "../../domain/entities/knowledge-article.js";
import type { KnowledgeRepository } from "../../domain/repositories/knowledge-repository.js";
import { validateUpdate } from "../validation.js";

export class UpdateKnowledgeUseCase {
  constructor(private readonly repository: KnowledgeRepository) {}

  async execute(id: string, input: UpdateKnowledgeInput): Promise<KnowledgeArticle> {
    const valid = validateUpdate(input);
    const article = await this.repository.update(id, valid);
    if (!article) {
      throw new NotFoundError("Artículo de conocimiento no encontrado");
    }
    return article;
  }
}