import type { PrismaClient } from "../../generated/prisma/client.js";
import type { KnowledgeArticle, KnowledgeRepository } from "../domain/knowledge.js";
import { selectBestMatch } from "../domain/knowledge.js";

export class PrismaKnowledgeBaseRepository implements KnowledgeRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly minConfidence: number,
  ) {}

  async findAnswer(query: string): Promise<string | null> {
    return selectBestMatch(query, await this.candidates(), this.minConfidence);
  }

  private async candidates(): Promise<KnowledgeArticle[]> {
    const articles = await this.db.knowledgeArticle.findMany({ where: { active: true } });
    return articles.map((article) => ({
      id: article.id,
      title: article.title,
      content: article.content,
      keywords: article.keywords,
    }));
  }
}