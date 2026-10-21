import type { LlmProvider } from '../domain/llm-provider.js';
import type { LlmProviderKind } from '../../../shared/config/llm-provider.js';
import { CloudflareLlmProvider } from './cloudflare-llm-provider.js';
import { OllamaLlmProvider } from './ollama-llm-provider.js';

export interface CreateLlmProviderOptions {
  /** Proveedor elegido: "ollama" (IA local, por defecto) o "cloudflare" (pruebas). */
  provider: LlmProviderKind;
  timeoutMs: number;
  ollamaBaseUrl: string;
  ollamaModel: string;
  cloudflareAccountId: string;
  cloudflareApiToken: string;
  llmModel: string;
}

/**
 * Construye el adaptador de IA según el proveedor configurado.
 *
 * - "ollama": IA local (producción en la empresa).
 * - "cloudflare": Workers AI. Solo para pruebas con datos ficticios; si faltan
 *   las credenciales se lanza un error al arrancar (fail fast) en vez de fallar
 *   en cada mensaje.
 */
export function createLlmProvider(options: CreateLlmProviderOptions): LlmProvider {
  if (options.provider === 'cloudflare') {
    const missing: string[] = [];
    if (options.cloudflareAccountId.trim().length === 0) missing.push('CLOUDFLARE_ACCOUNT_ID');
    if (options.cloudflareApiToken.trim().length === 0) missing.push('CLOUDFLARE_API_TOKEN');
    if (options.llmModel.trim().length === 0) missing.push('LLM_MODEL');

    if (missing.length > 0) {
      throw new Error(`LLM_PROVIDER=cloudflare requiere: ${missing.join(', ')}`);
    }

    return new CloudflareLlmProvider({
      accountId: options.cloudflareAccountId,
      apiToken: options.cloudflareApiToken,
      model: options.llmModel,
      timeoutMs: options.timeoutMs,
    });
  }

  return new OllamaLlmProvider(options.ollamaBaseUrl, options.ollamaModel, options.timeoutMs);
}
