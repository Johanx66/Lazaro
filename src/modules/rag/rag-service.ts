import type { PrismaClient } from "../../generated/prisma/client.js";
import { readFile } from "node:fs/promises";
import type { EmbeddingProvider } from "./embedding-provider.js";
import { normalizeEmbedding } from "./embedding-provider.js";

export type EscalationMode = "ninguno" | "ofrecer" | "inmediato";
export interface RagEntry {
  id: string;
  category: string;
  topic: string;
  intent: string;
  question: string;
  variations: string[];
  keywords: string[];
  answer: string;
  answerAfterRegistration: string | null;
  priority: string;
  escalationMode: EscalationMode;
  escalationReason: string | null;
  requiredData: unknown;
  suggestedActions: unknown;
  confirmationQuestion: string | null;
  tool: string | null;
}
export interface RagChunk { entryId: string; vector: number[]; model: string; type: string; }
export interface VectorStore {
  search(vector: number[], topK: number): Promise<Array<{ entryId: string; score: number }>>;
}

export class InMemoryVectorStore implements VectorStore {
  constructor(private readonly chunks: RagChunk[]) {}

  async search(query: number[], topK: number): Promise<Array<{ entryId: string; score: number }>> {
    if (this.chunks.some((chunk) => chunk.vector.length !== query.length)) {
      throw new Error("La dimensión de los embeddings no coincide con la base importada");
    }
    const scores = this.chunks.map((chunk) => ({
      entryId: chunk.entryId,
      score: chunk.vector.reduce((sum, component, index) => sum + component * (query[index] ?? 0), 0),
    }));
    return scores.sort((left, right) => right.score - left.score).slice(0, topK);
  }
}

export interface RagMatch { entry: RagEntry; score: number; secondScore: number; ambiguous: boolean; }

export function isAmbiguousRagCandidate(best: RagEntry, bestScore: number, second: RagEntry | undefined, secondScore: number, margin: number): boolean {
  return Boolean(second && bestScore - secondScore < margin &&
    (best.escalationMode !== second.escalationMode || best.category !== second.category));
}

export class RagService implements VectorStore {
  private constructor(
    private readonly entries: Map<string, RagEntry>,
    private readonly vectors: InMemoryVectorStore,
    private readonly provider: EmbeddingProvider,
    private readonly topK: number,
    private readonly ambiguityMargin: number,
    readonly lowConfidenceMessage: string,
  ) {}

  static async fromDatabase(
    db: PrismaClient,
    provider: EmbeddingProvider,
    topK: number,
    ambiguityMargin: number,
  ): Promise<RagService> {
    const [entries, chunks] = await Promise.all([
      db.knowledgeEntry.findMany({ where: { active: true } }),
      db.knowledgeChunk.findMany({ where: { model: provider.model } }),
    ]);
    const source = JSON.parse(await readFile(new URL("../../../prisma/data/pqrs_base_conocimiento_v2.json", import.meta.url), "utf8")) as {
      configuracion?: { recuperacion_baja_confianza?: { mensaje?: string } };
    };
    const byId = new Map(entries.map((entry) => [entry.id, {
      id: entry.id,
      category: entry.category,
      topic: entry.topic,
      intent: entry.intent,
      question: entry.question,
      variations: entry.variations,
      keywords: entry.keywords,
      answer: entry.answer,
      answerAfterRegistration: entry.answerAfterRegistration,
      priority: entry.priority,
      escalationMode: entry.escalationMode as EscalationMode,
      escalationReason: entry.escalationReason,
      requiredData: entry.requiredData,
      suggestedActions: entry.suggestedActions,
      confirmationQuestion: entry.confirmationQuestion,
      tool: entry.tool,
    }]));
    const vectors = chunks.flatMap((chunk) => {
      if (!byId.has(chunk.entryId) || !Array.isArray(chunk.embedding)) return [];
      const vector = chunk.embedding.filter((value): value is number => typeof value === "number");
      return vector.length === chunk.dim ? [{ entryId: chunk.entryId, vector, model: chunk.model, type: chunk.type }] : [];
    });
    const dimensions = new Set(vectors.map((chunk) => chunk.vector.length));
    if (byId.size === 0 || vectors.length === 0 || dimensions.size !== 1) {
      throw new Error("La base RAG no está importada o sus embeddings tienen dimensiones incompatibles");
    }
    const lowConfidenceMessage = source.configuracion?.recuperacion_baja_confianza?.mensaje;
    if (!lowConfidenceMessage) throw new Error("La configuración RAG no incluye el mensaje de baja confianza");
    return new RagService(byId, new InMemoryVectorStore(vectors), provider, topK, ambiguityMargin, lowConfidenceMessage);
  }

  async search(vector: number[], topK: number): Promise<Array<{ entryId: string; score: number }>> {
    return this.vectors.search(vector, topK);
  }

  async find(query: string): Promise<RagMatch | null> {
    const [queryVector] = await this.provider.embed([maskLongNumbers(query)]);
    if (!queryVector) return null;
    const results = await this.search(normalizeEmbedding(queryVector), this.topK);
    const bestByEntry = new Map<string, number>();
    for (const result of results) {
      bestByEntry.set(result.entryId, Math.max(bestByEntry.get(result.entryId) ?? -1, result.score));
    }
    const ranked = [...bestByEntry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const best = ranked[0];
    if (!best) return null;
    const entry = this.entries.get(best[0]);
    if (!entry) return null;
    const second = ranked[1];
    const secondEntry = second ? this.entries.get(second[0]) : undefined;
    const ambiguous = isAmbiguousRagCandidate(entry, best[1], secondEntry, second?.[1] ?? 0, this.ambiguityMargin);
    return { entry, score: best[1], secondScore: second?.[1] ?? 0, ambiguous };
  }

  async findAnswer(query: string, minimumScore: number): Promise<RagMatch | null> {
    const match = await this.find(query);
    return match && match.score >= minimumScore ? match : null;
  }

  getEntry(id: string): RagEntry | null { return this.entries.get(id) ?? null; }
}

export function maskLongNumbers(text: string): string {
  return text.replace(/\d[\d\s-]{6,}\d/gu, "[dato numérico oculto]");
}

export function renderPlaceholders(text: string, values: { companyName: string; officialChannel: string; conditionsUrl: string }): string {
  return text
    .replaceAll("{{nombre_empresa}}", values.companyName)
    .replaceAll("{{canal_oficial_pqrs}}", values.officialChannel)
    .replaceAll("{{url_condiciones}}", values.conditionsUrl);
}
