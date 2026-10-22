import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { EmbeddingProvider } from "./embedding-provider.js";
import { normalizeEmbedding } from "./embedding-provider.js";
import { importKnowledgeBase } from "./importer.js";
import { InMemoryVectorStore, isAmbiguousRagCandidate, maskLongNumbers, renderPlaceholders } from "./rag-service.js";
import type { RagEntry } from "./rag-service.js";

const tempDirs: string[] = [];
afterEach(async () => { await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe("RAG helpers", () => {
  it("normaliza vectores, recupera por coseno y oculta secuencias numéricas largas", async () => {
    const store = new InMemoryVectorStore([
      { entryId: "a", vector: normalizeEmbedding([1, 0]), model: "test", type: "principal" },
      { entryId: "b", vector: normalizeEmbedding([0, 1]), model: "test", type: "principal" },
    ]);
    await expect(store.search([1, 0], 1)).resolves.toEqual([{ entryId: "a", score: 1 }]);
    expect(maskLongNumbers("mi documento 1234 5678 9012" )).toBe("mi documento [dato numérico oculto]");
    expect(normalizeEmbedding([3, 4])).toEqual([0.6, 0.8]);
  });

  it("renderiza los placeholders configurables y deja intacto el radicado", () => {
    expect(renderPlaceholders("{{nombre_empresa}} / {{canal_oficial_pqrs}} / {{numero_radicado}}", {
      companyName: "Empresa Demo", officialChannel: "el canal oficial", conditionsUrl: "condiciones",
    })).toBe("Empresa Demo / el canal oficial / {{numero_radicado}}");
  });

  it("marca empate solo si el margen es pequeño y la regla de escalamiento cambia", () => {
    const candidate = (id: string, category: string, escalationMode: RagEntry["escalationMode"]): RagEntry => ({
      id, category, topic: "demo", intent: "demo", question: "demo", variations: [], keywords: [],
      answer: "demo", answerAfterRegistration: null, priority: "media", escalationMode,
      escalationReason: null, requiredData: [], suggestedActions: [], confirmationQuestion: null, tool: null,
    });
    const best = candidate("a", "queja", "inmediato");
    const different = candidate("b", "peticion", "ninguno");
    expect(isAmbiguousRagCandidate(best, 0.8, different, 0.78, 0.04)).toBe(true);
    expect(isAmbiguousRagCandidate(best, 0.8, different, 0.7, 0.04)).toBe(false);
  });

  it("upsertea entradas incluso con escalamiento y reutiliza embeddings sin cambios", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rag-import-"));
    tempDirs.push(dir);
    const path = join(dir, "kb.json");
    await writeFile(path, JSON.stringify({
      configuracion: { placeholders: {
        "{{nombre_empresa}}": { valor_por_defecto: "Demo" },
        "{{canal_oficial_pqrs}}": { texto_si_falta: "canal oficial" },
        "{{url_condiciones}}": { texto_si_falta: "condiciones publicadas" },
      } },
      entradas: [{
        id: "caso.demo", categoria: "queja", tema: "demo", intencion: "demo",
        pregunta_principal: "Ayuda {{nombre_empresa}}", variaciones: ["Otra forma"],
        palabras_clave: [], respuesta: "Contacta por {{canal_oficial_pqrs}}",
        prioridad: "alta", escalamiento: { modo: "inmediato", motivo: "regla" },
      }],
    }));
    const chunks: Array<{ entryId: string; text: string; type: string; model: string; dim: number; hash: string; embedding: number[] }> = [];
    const entries: Array<{ id: string; active: boolean; answer: string }> = [];
    let embeddingsCalls = 0;
    const db = {
      knowledgeEntry: { upsert: async (args: { create: { id: string; active: boolean; answer: string } }) => { entries.push(args.create); } },
      knowledgeChunk: {
        findMany: async () => chunks.map(({ entryId, type, hash: chunkHash }) => ({ entryId, type, hash: chunkHash })),
        deleteMany: async () => ({ count: 0 }),
        createMany: async (args: { data: typeof chunks }) => {
          for (const item of args.data) if (!chunks.some((chunk) => chunk.hash === item.hash && chunk.entryId === item.entryId)) chunks.push(item);
          return { count: args.data.length };
        },
      },
    } as unknown as PrismaClient;
    const provider: EmbeddingProvider = {
      model: "test-model",
      async embed(texts) { embeddingsCalls += 1; return texts.map((text) => [text.length, 1]); },
    };
    const args = [db, provider, path, { companyName: "", officialChannel: "", conditionsUrl: "" }] as const;
    const first = await importKnowledgeBase(...args);
    const second = await importKnowledgeBase(...args);
    expect(first).toMatchObject({ entries: 1, chunks: 2, embeddingsGenerated: 2 });
    expect(second).toMatchObject({ entries: 1, chunks: 2, embeddingsGenerated: 0 });
    expect(embeddingsCalls).toBe(1);
    expect(entries.at(-1)).toMatchObject({ active: true, answer: "Contacta por canal oficial" });
  });
});
