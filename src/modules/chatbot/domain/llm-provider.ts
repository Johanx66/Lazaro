export interface LlmCompletionOptions {
  systemPrompt?: string;
  temperature?: number;
  jsonMode?: boolean;
  /** Tope de tokens de la respuesta. Lo usa Cloudflare Workers AI (por defecto 256). */
  maxTokens?: number;
}

export interface LlmProvider {
  generateCompletion(prompt: string, options?: LlmCompletionOptions): Promise<string>;
}