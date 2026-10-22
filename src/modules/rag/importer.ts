import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { z } from "zod";
import type { EmbeddingProvider } from "./embedding-provider.js";
import { normalizeEmbedding } from "./embedding-provider.js";
import { maskLongNumbers, renderPlaceholders } from "./rag-service.js";

const sourceSchema = z.object({
  configuracion: z.object({
    placeholders: z.record(z.string(), z.object({ valor_por_defecto: z.string().nullable().optional(), texto_si_falta: z.string().optional() })),
  }),
  entradas: z.array(z.object({
    id: z.string().min(1), categoria: z.string().min(1), tema: z.string().min(1), intencion: z.string().min(1),
    pregunta_principal: z.string().min(1), variaciones: z.array(z.string()), palabras_clave: z.array(z.string()).optional(),
    respuesta: z.string().min(1), respuesta_tras_registro: z.string().optional(), prioridad: z.string().min(1),
    escalamiento: z.object({ modo: z.enum(["ninguno", "ofrecer", "inmediato"]), motivo: z.string().optional() }),
    datos_requeridos: z.unknown().optional(), acciones_sugeridas: z.unknown().optional(),
    pregunta_confirmacion: z.string().optional(), herramienta: z.string().optional(),
  })),
});
type KnowledgeFile = z.infer<typeof sourceSchema>;

export interface ImportOptions {
  companyName: string;
  officialChannel: string;
  conditionsUrl: string;
}

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }

export async function importKnowledgeBase(
  db: PrismaClient,
  provider: EmbeddingProvider,
  sourcePath: URL | string,
  options: ImportOptions,
): Promise<{ entries: number; chunks: number; embeddingsGenerated: number }> {
  const source: KnowledgeFile = sourceSchema.parse(JSON.parse(await readFile(sourcePath, "utf8")) as unknown);
  const fallback = (key: string): string => source.configuracion.placeholders[key]?.texto_si_falta ?? key;
  const placeholders = {
    companyName: options.companyName || source.configuracion.placeholders["{{nombre_empresa}}"]?.valor_por_defecto || "",
    officialChannel: options.officialChannel || fallback("{{canal_oficial_pqrs}}"),
    conditionsUrl: options.conditionsUrl || fallback("{{url_condiciones}}"),
  };
  const imported = source.entradas.map((entry) => ({
    entry,
    question: renderPlaceholders(entry.pregunta_principal, placeholders),
    answer: renderPlaceholders(entry.respuesta, placeholders),
    after: entry.respuesta_tras_registro
      ? entry.respuesta_tras_registro.replaceAll("{{nombre_empresa}}", placeholders.companyName)
        .replaceAll("{{canal_oficial_pqrs}}", placeholders.officialChannel)
        .replaceAll("{{url_condiciones}}", placeholders.conditionsUrl)
      : null,
  }));
  let generated = 0;
  let chunkCount = 0;
  for (let offset = 0; offset < imported.length; offset += 16) {
    const batch = imported.slice(offset, offset + 16);
    const work: Array<{ entryId: string; text: string; type: string; hash: string }> = [];
    for (const item of batch) {
      const texts = [{ text: item.question, type: "principal" }, ...item.entry.variaciones.map((text) => ({ text: renderPlaceholders(text, placeholders), type: "variacion" }))];
      for (const value of texts) work.push({ entryId: item.entry.id, text: value.text, type: value.type, hash: hash(value.text) });
    }
    const known = await db.knowledgeChunk.findMany({
      where: { entryId: { in: batch.map((item) => item.entry.id) }, model: provider.model },
      select: { entryId: true, type: true, hash: true },
    });
    const knownKeys = new Set(known.map((item) => `${item.entryId}:${item.type}:${item.hash}`));
    const missing = work.filter((item) => !knownKeys.has(`${item.entryId}:${item.type}:${item.hash}`));
    const vectors: number[][] = [];
    for (let start = 0; start < missing.length; start += 32) {
      const generatedVectors = await provider.embed(missing.slice(start, start + 32).map((item) => maskLongNumbers(item.text)));
      vectors.push(...generatedVectors.map(normalizeEmbedding));
    }
    const dataByEntry = new Map(batch.map(({ entry, question, answer, after }) => [entry.id, {
      id: entry.id, category: entry.categoria, topic: entry.tema, intent: entry.intencion,
      question, variations: entry.variaciones.map((text) => renderPlaceholders(text, placeholders)),
      keywords: entry.palabras_clave ?? [], answer, answerAfterRegistration: after,
      priority: entry.prioridad, escalationMode: entry.escalamiento.modo,
      escalationReason: entry.escalamiento.motivo ?? null,
      requiredData: (entry.datos_requeridos ?? []) as Prisma.InputJsonValue,
      suggestedActions: (entry.acciones_sugeridas ?? []) as Prisma.InputJsonValue,
      confirmationQuestion: entry.pregunta_confirmacion ? renderPlaceholders(entry.pregunta_confirmacion, placeholders) : null,
      tool: entry.herramienta ?? null, active: true,
    }]));
    for (const data of dataByEntry.values()) {
      await db.knowledgeEntry.upsert({ where: { id: data.id }, create: data, update: data });
      await db.knowledgeChunk.deleteMany({ where: { entryId: data.id, NOT: { model: provider.model } } });
      const desiredHashes = work.filter((item) => item.entryId === data.id).map((item) => item.hash);
      await db.knowledgeChunk.deleteMany({ where: { entryId: data.id, model: provider.model, hash: { notIn: desiredHashes } } });
    }
    if (missing.length > 0) {
      await db.knowledgeChunk.createMany({
        data: missing.map((item, index) => ({
          entryId: item.entryId, text: item.text, type: item.type, model: provider.model,
          dim: vectors[index]?.length ?? 0, hash: item.hash,
          embedding: (vectors[index] ?? []) as Prisma.InputJsonValue,
        })),
        skipDuplicates: true,
      });
      generated += missing.length;
    }
    chunkCount += work.length;
  }
  return { entries: imported.length, chunks: chunkCount, embeddingsGenerated: generated };
}
