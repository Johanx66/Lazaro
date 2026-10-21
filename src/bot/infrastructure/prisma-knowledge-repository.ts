import type { PrismaClient } from "../../generated/prisma/client.js";
import type { KnowledgeArticle, KnowledgeRepository } from "../domain/knowledge.js";
import { selectBestMatch } from "../domain/knowledge.js";

export interface PrismaKnowledgeOptions {
  /**
   * Prefijo de categoría: si se indica, solo se buscan los artículos cuya
   * categoría empieza por ese prefijo (p. ej. "PQRS"). Sin él, se usan todos
   * los artículos activos.
   */
  categoryPrefix?: string;
}

export class PrismaKnowledgeBaseRepository implements KnowledgeRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly minConfidence: number,
    private readonly options: PrismaKnowledgeOptions = {},
  ) {}

  async findAnswer(query: string): Promise<string | null> {
    return selectBestMatch(query, await this.candidates(), this.minConfidence);
  }

  private async candidates(): Promise<KnowledgeArticle[]> {
    const prefix = this.options.categoryPrefix;
    const articles = await this.db.knowledgeArticle.findMany({
      where: {
        active: true,
        ...(prefix ? { category: { startsWith: prefix } } : {}),
      },
    });
    return articles.map((article) => ({
      id: article.id,
      title: article.title,
      content: article.content,
      keywords: article.keywords,
    }));
  }
}