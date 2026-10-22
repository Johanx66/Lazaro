import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { env } from "../src/shared/config/env.js";
import { CloudflareEmbeddingProvider, OllamaEmbeddingProvider, normalizeEmbedding } from "../src/modules/rag/embedding-provider.js";
import { maskLongNumbers } from "../src/modules/rag/rag-service.js";

interface Entry { id: string; categoria: string; tema: string; pregunta_principal: string; variaciones: string[]; prioridad: string; escalamiento: { modo: string }; }
interface TestCase { mensaje: string; esperado_alguno_de?: string[]; esperado_baja_confianza?: boolean; }
interface VectorCache { model: string; vectors: Record<string, number[]>; }
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const readJson = async <T>(url: URL): Promise<T> => JSON.parse(await readFile(url, "utf8")) as T;

const kb = await readJson<{ entradas: Entry[] }>(new URL("../prisma/data/pqrs_base_conocimiento_v2.json", import.meta.url));
const testFile = await readJson<{ casos: TestCase[] }>(new URL("../prisma/data/pruebas_rag.json", import.meta.url));
const cacheUrl = new URL("../prisma/data/.rag-embeddings-cache.json", import.meta.url);
const provider = env.embeddingProvider === "cloudflare"
  ? new CloudflareEmbeddingProvider(env.embeddingModel, env.cloudflareAccountId, env.cloudflareApiToken, env.llmTimeoutMs)
  : new OllamaEmbeddingProvider(env.embeddingModel, env.ollamaBaseUrl, env.llmTimeoutMs);
let cache: VectorCache = { model: provider.model, vectors: {} };
try {
  const existing = await readJson<VectorCache>(cacheUrl);
  if (existing.model === provider.model) cache = existing;
} catch { /* Cache is built on first run. */ }
const texts = new Map<string, string>();
for (const entry of kb.entradas) {
  for (const text of [entry.pregunta_principal, ...entry.variaciones]) texts.set(hash(text), text);
}
for (const test of testFile.casos) texts.set(hash(test.mensaje), test.mensaje);
const missing = [...texts.entries()].filter(([key]) => !cache.vectors[key]);
for (let offset = 0; offset < missing.length; offset += 32) {
  const batch = missing.slice(offset, offset + 32);
  const embedded = await provider.embed(batch.map(([, text]) => maskLongNumbers(text)));
  batch.forEach(([key], index) => { const vector = embedded[index]; if (vector) cache.vectors[key] = normalizeEmbedding(vector); });
}
await writeFile(cacheUrl, JSON.stringify(cache));

const topK = env.ragTopK;
function ranked(message: string): Array<{ entry: Entry; score: number }> {
  const vector = cache.vectors[hash(message)];
  if (!vector) return [];
  const chunks: Array<{ id: string; score: number }> = [];
  for (const entry of kb.entradas) {
    for (const text of [entry.pregunta_principal, ...entry.variaciones]) {
      const candidate = cache.vectors[hash(text)];
      if (!candidate || candidate.length !== vector.length) continue;
      chunks.push({ id: entry.id, score: candidate.reduce((sum, value, index) => sum + value * vector[index]!, 0) });
    }
  }
  const best = new Map<string, number>();
  chunks.sort((a, b) => b.score - a.score).slice(0, topK).forEach((item) => best.set(item.id, Math.max(best.get(item.id) ?? -1, item.score)));
  return [...best.entries()].map(([id, score]) => ({ entry: kb.entradas.find((entry) => entry.id === id)!, score })).sort((a, b) => b.score - a.score).slice(0, 3);
}

const results = testFile.casos.map((test) => ({ test, ranked: ranked(test.mensaje) }));
const successfulIds = (test: TestCase): string[] => test.esperado_alguno_de ?? [];
const scored = results.filter((item) => successfulIds(item.test).length > 0);
let top1 = 0; let top3 = 0; let equivalent = 0;
for (const item of scored) {
  const ids = successfulIds(item.test);
  if (ids.includes(item.ranked[0]?.entry.id ?? "")) top1 += 1;
  if (item.ranked.slice(0, 3).some(({ entry }) => ids.includes(entry.id))) top3 += 1;
  const expected = kb.entradas.filter((entry) => ids.includes(entry.id));
  if (expected.length > 0 && item.ranked.slice(0, 3).some(({ entry }) => expected.some((candidate) => entry.tema === candidate.tema && entry.categoria === candidate.categoria))) equivalent += 1;
  if (ids.length > 0 && !item.ranked.slice(0, 3).some(({ entry }) => ids.includes(entry.id))) {
    console.log(JSON.stringify({ fallo: item.test.mensaje, esperado: ids, top: item.ranked.map(({ entry, score }) => ({ id: entry.id, score: Number(score.toFixed(3)) })) }));
  }
}
console.log(`Top-1: ${top1}/${scored.length} (${(top1 / scored.length * 100).toFixed(1)}%) | Top-3: ${top3}/${scored.length} (${(top3 / scored.length * 100).toFixed(1)}%) | Equivalente top-3: ${equivalent}/${scored.length}`);
const transferPredictions = results.flatMap(({ ranked: candidates }) => {
  const best = candidates[0];
  if (!best || (best.score < env.ragMinScore && best.entry.priority !== "critica")) return [];
  return best.entry.escalamiento.modo === "inmediato" || best.entry.priority === "critica"
    ? [{ immediate: best.entry.escalamiento.modo === "inmediato" }]
    : [];
});
const nonImmediateTransfers = transferPredictions.filter((item) => !item.immediate).length;
console.log(`Escalamientos previstos: ${transferPredictions.length} | Sin modo inmediato: ${nonImmediateTransfers}/${results.length} (${(nonImmediateTransfers / results.length * 100).toFixed(1)}%)`);
console.log("Umbral | Aciertos top-1 | Aciertos top-3 | Falsos positivos | Baja confianza capturada");
for (let threshold = 0.4; threshold <= 0.8001; threshold += 0.05) {
  let correctTop1 = 0; let correctTop3 = 0; let lowCaptured = 0; let fp = 0;
  for (const { test, ranked: candidates } of results) {
    const acceptedTop = candidates[0]?.score >= threshold ? candidates[0] : undefined;
    if (test.esperado_baja_confianza && !acceptedTop) lowCaptured += 1;
    if (acceptedTop) {
      const ids = successfulIds(test);
      if (ids.includes(acceptedTop.entry.id)) correctTop1 += 1;
      if (candidates.slice(0, 3).some(({ entry }) => ids.includes(entry.id))) correctTop3 += 1;
      if (test.esperado_baja_confianza || (ids.length > 0 && !ids.includes(acceptedTop.entry.id))) fp += 1;
    }
  }
  console.log(`${threshold.toFixed(2)} | ${correctTop1}/${scored.length} | ${correctTop3}/${scored.length} | ${fp} | ${lowCaptured}`);
}
console.log("Metas iniciales: top-3 ≥95 %, top-1 ≥85 %, menos del 10 % de transferencias no inmediatas.");
if (scored.length === 0 || top3 / scored.length < 0.95 || top1 / scored.length < 0.85 || nonImmediateTransfers / results.length >= 0.1) process.exitCode = 2;
