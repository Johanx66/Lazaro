import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudflareEmbeddingProvider } from "./embedding-provider.js";

afterEach(() => vi.unstubAllGlobals());

describe("CloudflareEmbeddingProvider", () => {
  it("acepta la matriz de vectores que Workers AI devuelve en result.data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      result: { shape: [2, 3], data: [[1, 2, 3], [4, 5, 6]], pooling: "mean" },
      success: true,
      errors: [],
      messages: [],
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const provider = new CloudflareEmbeddingProvider("@cf/baai/bge-m3", "test-account", "test-token", 1000);
    await expect(provider.embed(["texto uno", "texto dos"])).resolves.toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });

  it("mantiene compatibilidad con elementos data que contienen embedding", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      result: { data: [{ embedding: [1, 0] }, { embedding: [0, 1] }] },
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const provider = new CloudflareEmbeddingProvider("@cf/baai/bge-m3", "test-account", "test-token", 1000);
    await expect(provider.embed(["a", "b"])).resolves.toEqual([[1, 0], [0, 1]]);
  });
});
