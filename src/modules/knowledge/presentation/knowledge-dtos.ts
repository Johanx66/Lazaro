import { optionalBoolean, requireString, stringArray } from "../../../shared/http/request.js";
import type {
  CreateKnowledgeInput,
  UpdateKnowledgeInput,
} from "../domain/entities/knowledge-article.js";

export function toCreateKnowledgeInput(body: Record<string, unknown>): CreateKnowledgeInput {
  return {
    title: requireString(body, "title"),
    content: requireString(body, "content"),
    category: requireString(body, "category"),
    keywords: stringArray(body, "keywords"),
  };
}

export function toUpdateKnowledgeInput(body: Record<string, unknown>): UpdateKnowledgeInput {
  const input: UpdateKnowledgeInput = {};
  if (body.title !== undefined) input.title = requireString(body, "title");
  if (body.content !== undefined) input.content = requireString(body, "content");
  if (body.category !== undefined) input.category = requireString(body, "category");
  if (body.keywords !== undefined) input.keywords = stringArray(body, "keywords");
  if (body.active !== undefined) input.active = optionalBoolean(body, "active");
  return input;
}