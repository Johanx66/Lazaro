export interface KnowledgeArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  keywords: string[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateKnowledgeInput {
  title: string;
  content: string;
  category: string;
  keywords: string[];
}

export interface UpdateKnowledgeInput {
  title?: string;
  content?: string;
  category?: string;
  keywords?: string[];
  active?: boolean;
}

export interface ListKnowledgeFilters {
  category?: string;
}

export type ActiveFilter = "all" | "true" | "false";

export interface ListKnowledgePageFilters {
  page: number;
  pageSize: number;
  q?: string;
  category?: string;
  active: ActiveFilter;
}

export interface KnowledgePage {
  items: KnowledgeArticle[];
  page: number;
  pageSize: number;
  total: number;
}
