import type {
  CreateKnowledgeInput,
  KnowledgeArticle,
  KnowledgePage,
  ListKnowledgeFilters,
  ListKnowledgePageFilters,
  UpdateKnowledgeInput,
} from "../entities/knowledge-article.js";

export interface KnowledgeRepository {
  listActive(filters: ListKnowledgeFilters): Promise<KnowledgeArticle[]>;
  listPage(filters: ListKnowledgePageFilters): Promise<KnowledgePage>;
  findById(id: string): Promise<KnowledgeArticle | null>;
  create(input: CreateKnowledgeInput): Promise<KnowledgeArticle>;
  update(id: string, input: UpdateKnowledgeInput): Promise<KnowledgeArticle | null>;
}