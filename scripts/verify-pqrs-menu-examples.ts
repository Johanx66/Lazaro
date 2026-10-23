import { CloudflareEmbeddingProvider, OllamaEmbeddingProvider, normalizeEmbedding } from "../src/modules/rag/embedding-provider.js";
import { RagService } from "../src/modules/rag/rag-service.js";
import { prisma } from "../src/shared/infrastructure/prisma.js";
import { env } from "../src/shared/config/env.js";
import { PQRS_TOPIC_EXAMPLES } from "../src/bot/domain/pqrs-topic-examples.js";

const provider = env.embeddingProvider === "cloudflare"
  ? new CloudflareEmbeddingProvider(env.embeddingModel, env.cloudflareAccountId, env.cloudflareApiToken, env.llmTimeoutMs)
  : new OllamaEmbeddingProvider(env.embeddingModel, env.ollamaBaseUrl, env.llmTimeoutMs);

try {
  if (!env.databaseUrl) throw new Error("Configura DATABASE_URL para consultar los chunks RAG importados.");
  const rag = await RagService.fromDatabase(prisma, provider, env.ragTopK, env.ragAmbiguityMargin);
  const queries = Object.entries(PQRS_TOPIC_EXAMPLES).flatMap(([topic, examples]) => examples.map((text) => ({ topic, text })));
  let passed = 0;
  const failures: Array<{ topic: string; text: string; retrievedTopic: string | null; entryId: string | null }> = [];

  for (let offset = 0; offset < queries.length; offset += 16) {
    const batch = queries.slice(offset, offset + 16);
    const vectors = await provider.embed(batch.map(({ text }) => text));
    for (const [index, query] of batch.entries()) {
      const vector = vectors[index];
      if (!vector) throw new Error("El proveedor devolvió una cantidad incompleta de embeddings.");
      const results = await rag.search(normalizeEmbedding(vector), env.ragTopK);
      const bestByEntry = new Map<string, number>();
      for (const result of results) bestByEntry.set(result.entryId, Math.max(bestByEntry.get(result.entryId) ?? -1, result.score));
      const bestId = [...bestByEntry.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
      const found = bestId ? rag.getEntry(bestId) : null;
      if (found?.topic === query.topic) passed += 1;
      else failures.push({ topic: query.topic, text: query.text, retrievedTopic: found?.topic ?? null, entryId: found?.id ?? null });
    }
  }

  console.log(`Ejemplos que recuperan su tema: ${passed}/${queries.length}.`);
  if (failures.length > 0) {
    console.error(JSON.stringify({ fallidos: failures }, null, 2));
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
