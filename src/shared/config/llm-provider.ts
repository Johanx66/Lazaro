/**
 * Proveedor de IA del bot.
 *
 * - "ollama": IA LOCAL (Ollama). Es el proveedor por defecto y el de producción
 *   en la empresa.
 * - "cloudflare": Cloudflare Workers AI. EXCLUSIVAMENTE para pruebas con datos
 *   ficticios (ver AGENTS.md §5.1): el prompt y los datos salen del servidor de
 *   la empresa hacia un tercero.
 */
export type LlmProviderKind = "ollama" | "cloudflare";

/** Valores aceptados por LLM_PROVIDER. */
export const LLM_PROVIDERS: readonly LlmProviderKind[] = ["ollama", "cloudflare"];

export function isLlmProviderKind(value: string): boolean {
  return (LLM_PROVIDERS as readonly string[]).includes(value.trim().toLowerCase());
}

/**
 * Valor efectivo del proveedor. "ollama" por defecto (IA local). Un valor
 * inválido lo reporta `validateConfig`; aquí se usa el valor por defecto para no
 * dejar la aplicación sin proveedor.
 */
export function resolveLlmProvider(raw: string | undefined): LlmProviderKind {
  const normalized = (raw ?? "").trim().toLowerCase();
  return isLlmProviderKind(normalized) ? (normalized as LlmProviderKind) : "ollama";
}
