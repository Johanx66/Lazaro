export interface LlmCompletionOptions {
  systemPrompt?: string;
  temperature?: number;
  jsonMode?: boolean;
}

export interface LlmProvider {
  generateCompletion(prompt: string, options?: LlmCompletionOptions): Promise<string>;
}