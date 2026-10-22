import { describe, expect, it } from "vitest";
import {
  CLOUDFLARE_EMBEDDINGS_PRODUCTION_WARNING,
  enforceCloudflareEmbeddingPolicy,
  isCloudflareEmbeddingsAllowed,
} from "./cloudflare-embedding-policy.js";

describe("política de Cloudflare embeddings en producción", () => {
  it("por defecto la variable ausente y false no permiten Cloudflare", () => {
    expect(isCloudflareEmbeddingsAllowed(undefined)).toBe(false);
    expect(isCloudflareEmbeddingsAllowed("false")).toBe(false);
    expect(() =>
      enforceCloudflareEmbeddingPolicy({
        nodeEnv: "production",
        embeddingProvider: "cloudflare",
        embeddingsRequired: true,
        allowCloudflareEmbeddings: isCloudflareEmbeddingsAllowed(undefined),
      }),
    ).toThrow("Cloudflare embeddings solo se permite en pruebas con datos ficticios");
  });

  it("true permite Cloudflare embeddings en producción y devuelve la advertencia", () => {
    expect(isCloudflareEmbeddingsAllowed("true")).toBe(true);
    expect(
      enforceCloudflareEmbeddingPolicy({
        nodeEnv: "production",
        embeddingProvider: "cloudflare",
        embeddingsRequired: true,
        allowCloudflareEmbeddings: isCloudflareEmbeddingsAllowed("true"),
      }),
    ).toBe(CLOUDFLARE_EMBEDDINGS_PRODUCTION_WARNING);
  });

  it("no bloquea Cloudflare fuera de producción ni cuando los embeddings no se usan", () => {
    expect(
      enforceCloudflareEmbeddingPolicy({
        nodeEnv: "development",
        embeddingProvider: "cloudflare",
        embeddingsRequired: true,
        allowCloudflareEmbeddings: false,
      }),
    ).toBeUndefined();
    expect(
      enforceCloudflareEmbeddingPolicy({
        nodeEnv: "production",
        embeddingProvider: "cloudflare",
        embeddingsRequired: false,
        allowCloudflareEmbeddings: false,
      }),
    ).toBeUndefined();
  });
});
