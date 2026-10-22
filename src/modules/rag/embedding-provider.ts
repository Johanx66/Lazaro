export interface EmbeddingProvider {
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}

type JsonObject = Record<string, unknown>;

async function postJson(url: string, body: JsonObject, headers: Record<string, string>, timeoutMs: number): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`Proveedor de embeddings respondió HTTP ${response.status}`);
      return await response.json() as unknown;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
    }
  }
  throw new Error("No fue posible generar embeddings", { cause: lastError });
}

function vectorsFrom(value: unknown, key: "embeddings" | "data"): number[][] {
  if (typeof value !== "object" || value === null) throw new Error("Respuesta inválida del proveedor de embeddings");
  const record = value as JsonObject;
  const source = record[key];
  const vectors = key === "data" && Array.isArray(source) && source.some(
    (item) => typeof item === "object" && item !== null && "embedding" in item,
  )
    ? source.map((item) => typeof item === "object" && item !== null ? (item as JsonObject).embedding : undefined)
    : source;
  if (!Array.isArray(vectors) || !vectors.every((vector) => Array.isArray(vector) && vector.every((n) => typeof n === "number" && Number.isFinite(n)))) {
    throw new Error("Respuesta inválida del proveedor de embeddings");
  }
  return vectors as number[][];
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  constructor(readonly model: string, private readonly baseUrl: string, private readonly timeoutMs: number) {}

  async embed(texts: string[]): Promise<number[][]> {
    const result = await postJson(`${this.baseUrl}/api/embed`, { model: this.model, input: texts }, {}, this.timeoutMs);
    const vectors = vectorsFrom(result, "embeddings");
    if (vectors.length !== texts.length) throw new Error("El proveedor devolvió una cantidad inesperada de embeddings");
    return vectors;
  }
}

export class CloudflareEmbeddingProvider implements EmbeddingProvider {
  constructor(
    readonly model: string,
    private readonly accountId: string,
    private readonly token: string,
    private readonly timeoutMs: number,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    const result = await postJson(
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`,
      { text: texts },
      { authorization: `Bearer ${this.token}` },
      this.timeoutMs,
    );
    if (typeof result !== "object" || result === null || !("result" in result)) {
      throw new Error("Respuesta inválida del proveedor de embeddings");
    }
    const vectors = vectorsFrom((result as JsonObject).result, "data");
    if (vectors.length !== texts.length) throw new Error("El proveedor devolvió una cantidad inesperada de embeddings");
    return vectors;
  }
}

export function normalizeEmbedding(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) throw new Error("El proveedor devolvió un embedding inválido");
  return vector.map((value) => value / magnitude);
}
