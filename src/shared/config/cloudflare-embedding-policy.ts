export const CLOUDFLARE_EMBEDDINGS_PRODUCTION_WARNING =
  "Cloudflare embeddings habilitado en producción: usar solo con datos ficticios";

export function isCloudflareEmbeddingsAllowed(value: string | undefined): boolean {
  return value === "true";
}

export type CloudflareEmbeddingPolicyOptions = {
  nodeEnv: string;
  embeddingProvider: string;
  embeddingsRequired: boolean;
  allowCloudflareEmbeddings: boolean;
};

export function enforceCloudflareEmbeddingPolicy(options: CloudflareEmbeddingPolicyOptions): string | undefined {
  if (
    !options.embeddingsRequired ||
    options.embeddingProvider !== "cloudflare" ||
    options.nodeEnv !== "production"
  ) {
    return undefined;
  }

  if (!options.allowCloudflareEmbeddings) {
    throw new Error("Cloudflare embeddings solo se permite en pruebas con datos ficticios");
  }

  return CLOUDFLARE_EMBEDDINGS_PRODUCTION_WARNING;
}
