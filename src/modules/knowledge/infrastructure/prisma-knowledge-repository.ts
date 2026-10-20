import type { Prisma } from "../../../generated/prisma/client.js";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import type {
  CreateKnowledgeInput,
  KnowledgeArticle,
  KnowledgePage,
  ListKnowledgeFilters,
  ListKnowledgePageFilters,
  UpdateKnowledgeInput,
} from "../domain/entities/knowledge-article.js";
import type { KnowledgeRepository } from "../domain/repositories/knowledge-repository.js";

// Prisma no escapa los comodines de LIKE en `contains`; se escapan para tratarlos como texto literal.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => "\\" + char);
}

export class PrismaKnowledgeRepository implements KnowledgeRepository {
  constructor(private readonly db: PrismaClient) {}

  async listActive(filters: ListKnowledgeFilters): Promise<KnowledgeArticle[]> {
    const where: Prisma.KnowledgeArticleWhereInput = { active: true };
    if (filters.category !== undefined) {
      where.category = filters.category;
    }
    const articles = await this.db.knowledgeArticle.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return articles.map((article) => this.toDomain(article));
  }

  async listPage(filters: ListKnowledgePageFilters): Promise<KnowledgePage> {
    const where: Prisma.KnowledgeArticleWhereInput = {};
    if (filters.category !== undefined) where.category = filters.category;
    if (filters.active !== "all") where.active = filters.active === "true";
    if (filters.q !== undefined) {
      const like = escapeLike(filters.q);
      where.OR = [
        { title: { contains: like, mode: "insensitive" } },
        { content: { contains: like, mode: "insensitive" } },
        { category: { contains: like, mode: "insensitive" } },
        { keywords: { has: filters.q.toLowerCase() } },
      ];
    }
    const [total, articles] = await this.db.$transaction([
      this.db.knowledgeArticle.count({ where }),
      this.db.knowledgeArticle.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
    ]);
    return {
      items: articles.map((article) => this.toDomain(article)),
      page: filters.page,
      pageSize: filters.pageSize,
      total,
    };
  }

  async findById(id: string): Promise<KnowledgeArticle | null> {
    const article = await this.db.knowledgeArticle.findUnique({ where: { id } });
    return article ? this.toDomain(article) : null;
  }

  async create(input: CreateKnowledgeInput): Promise<KnowledgeArticle> {
    const article = await this.db.knowledgeArticle.create({ data: input });
    return this.toDomain(article);
  }

  async update(id: string, input: UpdateKnowledgeInput): Promise<KnowledgeArticle | null> {
    const data: Prisma.KnowledgeArticleUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.content !== undefined) data.content = input.content;
    if (input.category !== undefined) data.category = input.category;
    if (input.keywords !== undefined) data.keywords = { set: input.keywords };
    if (input.active !== undefined) data.active = input.active;

    const article = await this.db.knowledgeArticle.update({ where: { id }, data });
    return this.toDomain(article);
  }

  private toDomain(article: {
    id: string;
    title: string;
    content: string;
    category: string;
    keywords: string[];
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): KnowledgeArticle {
    return {
      id: article.id,
      title: article.title,
      content: article.content,
      category: article.category,
      keywords: article.keywords,
      active: article.active,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
    };
  }
}