import { ValidationError } from "../../../shared/errors/app.error.js";
import type {
  CreateKnowledgeInput,
  ListKnowledgeFilters,
  ListKnowledgePageFilters,
  UpdateKnowledgeInput,
} from "../domain/entities/knowledge-article.js";

const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 20000;
const MAX_CATEGORY_LENGTH = 50;
const MAX_KEYWORDS = 10;
const MAX_KEYWORD_LENGTH = 40;

export function normalizeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const keyword of keywords) {
    const value = keyword.trim().toLowerCase();
    if (value.length === 0 || seen.has(value)) continue;
    if (value.length > MAX_KEYWORD_LENGTH) {
      throw new ValidationError(`Una palabra clave supera los ${MAX_KEYWORD_LENGTH} caracteres`);
    }
    seen.add(value);
    normalized.push(value);
  }
  if (normalized.length > MAX_KEYWORDS) {
    throw new ValidationError(`Máximo ${MAX_KEYWORDS} palabras clave por artículo`);
  }
  return normalized;
}

export function validateCreate(input: CreateKnowledgeInput): CreateKnowledgeInput {
  const title = input.title.trim();
  const content = input.content.trim();
  const category = input.category.trim();

  if (title.length === 0) {
    throw new ValidationError("El título del artículo es obligatorio");
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new ValidationError(`El título no puede superar los ${MAX_TITLE_LENGTH} caracteres`);
  }
  if (content.length === 0) {
    throw new ValidationError("El contenido del artículo es obligatorio");
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new ValidationError(`El contenido no puede superar los ${MAX_CONTENT_LENGTH} caracteres`);
  }
  if (category.length === 0) {
    throw new ValidationError("La categoría del artículo es obligatoria");
  }
  if (category.length > MAX_CATEGORY_LENGTH) {
    throw new ValidationError(`La categoría no puede superar los ${MAX_CATEGORY_LENGTH} caracteres`);
  }

  return { title, content, category, keywords: normalizeKeywords(input.keywords) };
}

export function validateUpdate(input: UpdateKnowledgeInput): UpdateKnowledgeInput {
  const result: UpdateKnowledgeInput = {};

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (title.length === 0) {
      throw new ValidationError("El título del artículo no puede quedar vacío");
    }
    if (title.length > MAX_TITLE_LENGTH) {
      throw new ValidationError(`El título no puede superar los ${MAX_TITLE_LENGTH} caracteres`);
    }
    result.title = title;
  }

  if (input.content !== undefined) {
    const content = input.content.trim();
    if (content.length === 0) {
      throw new ValidationError("El contenido del artículo no puede quedar vacío");
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      throw new ValidationError(`El contenido no puede superar los ${MAX_CONTENT_LENGTH} caracteres`);
    }
    result.content = content;
  }

  if (input.category !== undefined) {
    const category = input.category.trim();
    if (category.length === 0) {
      throw new ValidationError("La categoría del artículo no puede quedar vacía");
    }
    if (category.length > MAX_CATEGORY_LENGTH) {
      throw new ValidationError(`La categoría no puede superar los ${MAX_CATEGORY_LENGTH} caracteres`);
    }
    result.category = category;
  }

  if (input.keywords !== undefined) {
    result.keywords = normalizeKeywords(input.keywords);
  }

  if (input.active !== undefined) {
    result.active = input.active;
  }

  return result;
}

export function validateList(filters: ListKnowledgeFilters): ListKnowledgeFilters {
  if (filters.category === undefined) return {};
  const category = filters.category.trim();
  if (category.length === 0) {
    throw new ValidationError("El filtro de categoría no puede estar vacío");
  }
  return { category };
}

const MAX_QUERY_LENGTH = 100;
const MAX_PAGE = 1_000_000;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

export type RawListQuery = Record<string, unknown>;

function singleString(raw: RawListQuery, name: string): string | undefined {
  const value = raw[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new ValidationError(`El parámetro "${name}" debe enviarse una sola vez y como texto`);
  }
  return value;
}

function parseInteger(value: string | undefined, name: string, min: number, max: number, fallback: number): number {
  if (value === undefined) return fallback;
  const trimmed = value.trim();
  const parsed = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`El parámetro "${name}" debe ser un entero entre ${min} y ${max}`);
  }
  return parsed;
}

export function validateListPage(raw: RawListQuery): ListKnowledgePageFilters {
  const page = parseInteger(singleString(raw, "page"), "page", 1, MAX_PAGE, 1);
  const pageSize = parseInteger(singleString(raw, "pageSize"), "pageSize", 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);

  const rawQ = singleString(raw, "q")?.trim();
  if (rawQ !== undefined && rawQ.length > MAX_QUERY_LENGTH) {
    throw new ValidationError(`La búsqueda no puede superar los ${MAX_QUERY_LENGTH} caracteres`);
  }

  const rawCategory = singleString(raw, "category");
  const category = rawCategory?.trim();
  if (category !== undefined && category.length === 0) {
    throw new ValidationError("El filtro de categoría no puede estar vacío");
  }

  const rawActive = singleString(raw, "active") ?? "all";
  if (rawActive !== "all" && rawActive !== "true" && rawActive !== "false") {
    throw new ValidationError('El parámetro "active" debe ser all, true o false');
  }

  const result: ListKnowledgePageFilters = { page, pageSize, active: rawActive };
  if (rawQ !== undefined && rawQ.length > 0) result.q = rawQ;
  if (category !== undefined) result.category = category;
  return result;
}
