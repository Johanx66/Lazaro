import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { env } from "../src/shared/config/env.js";
import { CloudflareEmbeddingProvider, OllamaEmbeddingProvider } from "../src/modules/rag/embedding-provider.js";
import { importKnowledgeBase } from "../src/modules/rag/importer.js";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.databaseUrl }) });
const provider = env.embeddingProvider === "cloudflare"
  ? new CloudflareEmbeddingProvider(env.embeddingModel, env.cloudflareAccountId, env.cloudflareApiToken, env.llmTimeoutMs)
  : new OllamaEmbeddingProvider(env.embeddingModel, env.ollamaBaseUrl, env.llmTimeoutMs);

try {
  if (!env.databaseUrl) throw new Error("DATABASE_URL no está configurada");
  if (env.embeddingProvider === "cloudflare" && (!env.cloudflareAccountId || !env.cloudflareApiToken)) {
    throw new Error("Falta la configuración del proveedor Cloudflare");
  }
  const result = await importKnowledgeBase(
    db,
    provider,
    new URL("./data/pqrs_base_conocimiento_v2.json", import.meta.url),
    { companyName: env.companyName, officialChannel: env.officialChannel, conditionsUrl: env.conditionsUrl },
  );
  console.log(JSON.stringify({ msg: "Base PQRS importada", ...result }));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Error al importar la base PQRS");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
