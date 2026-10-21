import type { LlmProvider, LlmCompletionOptions } from '../domain/llm-provider.js';

/** Base de la API de Cloudflare Workers AI (endpoint "Execute AI model"). */
const WORKERS_AI_BASE_URL = 'https://api.cloudflare.com/client/v4';

/**
 * Modelos de Workers AI que soportan `response_format` (JSON Mode) según la
 * documentación oficial. Para el resto se instruye el JSON en el prompt del
 * sistema y se parsea de forma tolerante.
 */
const JSON_MODE_MODELS: readonly string[] = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-3-8b-instruct',
  '@cf/meta/llama-3.1-8b-instruct',
  '@hf/nousresearch/hermes-2-pro-mistral-7b',
  '@hf/thebloke/deepseek-coder-6.7b-instruct-awq',
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
];

/**
 * Códigos de error de Workers AI traducidos a mensajes controlados. Nunca se
 * incluye el contenido enviado o recibido (ni el token) en un error.
 */
const ERROR_MESSAGES: Record<number, string> = {
  3003: 'petición incompleta',
  3007: 'timeout del servicio',
  3008: 'petición abortada',
  3036: 'cuota diaria gratuita agotada (10.000 neuronas/día)',
  3040: 'sin capacidad temporal en el servicio',
  3042: 'nombre de modelo inválido',
  5007: 'el modelo no existe',
  5019: 'versión de SDK obsoleta',
  5035: 'el modelo requiere el plan Workers Paid',
};

/** Instrucción añadida al prompt del sistema cuando se pide JSON. */
const JSON_INSTRUCTION =
  'Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, sin explicaciones y sin bloques de código.';

const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MODEL_PATTERN = /^[A-Za-z0-9@._/-]{1,128}$/;

interface CloudflareAiError {
  code?: number;
}

interface CloudflareAiPayload {
  success?: boolean;
  result?: { response?: unknown };
  errors?: CloudflareAiError[];
}

export interface CloudflareLlmProviderOptions {
  /** CLOUDFLARE_ACCOUNT_ID: identificador de la cuenta de Cloudflare. */
  accountId: string;
  /** CLOUDFLARE_API_TOKEN: token de la API de Workers AI. Nunca se registra. */
  apiToken: string;
  /** LLM_MODEL: identificador del modelo, p. ej. "@cf/meta/llama-3.2-3b-instruct". */
  model: string;
  /** LLM_TIMEOUT_MS: tiempo máximo de espera de la respuesta. */
  timeoutMs: number;
}

/** ¿El modelo soporta `response_format` (JSON Mode)? */
export function supportsJsonMode(model: string): boolean {
  return JSON_MODE_MODELS.includes(model.trim().toLowerCase());
}

/** Quita un bloque de código ```json ... ``` si lo hay. */
function stripCodeFence(text: string): string {
  return text
    .replace(/^```[A-Za-z0-9_-]*\s*/, '')
    .replace(/```\s*$/, '')
    .trim();
}

/**
 * Extrae un JSON válido de una respuesta del modelo. Es tolerante: acepta
 * fences ```json, texto alrededor del objeto o saltos de línea. Devuelve
 * `undefined` si no hay JSON válido.
 */
export function parseJsonLoose(text: string): unknown | undefined {
  const trimmed = text.trim();
  const withoutFence = stripCodeFence(trimmed);
  const candidates: string[] = [];
  if (trimmed.length > 0) candidates.push(trimmed);
  if (withoutFence.length > 0 && withoutFence !== trimmed) candidates.push(withoutFence);
  const first = withoutFence.indexOf('{');
  const last = withoutFence.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(withoutFence.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Se prueba el siguiente candidato.
    }
  }
  return undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * Proveedor de IA que usa la API de Cloudflare Workers AI (`POST
 * /accounts/{account_id}/ai/run/{model}`) con `fetch` nativo, sin librerías
 * adicionales.
 *
 * Solo debe usarse con datos FICTICIOS: el prompt, el texto del usuario y los
 * datos de la BD salen del servidor de la empresa hacia Cloudflare
 * (AGENTS.md §5.1). No registra ni el prompt, ni la respuesta, ni el token.
 */
export class CloudflareLlmProvider implements LlmProvider {
  constructor(private readonly options: CloudflareLlmProviderOptions) {}

  async generateCompletion(prompt: string, options: LlmCompletionOptions = {}): Promise<string> {
    const { accountId, apiToken, model, timeoutMs } = this.options;

    if (apiToken.trim() === '') {
      throw new Error('Cloudflare Workers AI: falta CLOUDFLARE_API_TOKEN');
    }
    if (accountId.trim() === '') {
      throw new Error('Cloudflare Workers AI: falta CLOUDFLARE_ACCOUNT_ID');
    }
    if (model.trim() === '') {
      throw new Error('Cloudflare Workers AI: falta LLM_MODEL');
    }
    if (!ACCOUNT_ID_PATTERN.test(accountId.trim())) {
      throw new Error('Cloudflare Workers AI: CLOUDFLARE_ACCOUNT_ID tiene un formato inválido');
    }
    if (!MODEL_PATTERN.test(model.trim())) {
      throw new Error('Cloudflare Workers AI: LLM_MODEL tiene un formato inválido');
    }

    const wantsJson = options.jsonMode === true;
    const systemPrompt = wantsJson ? this.withJsonInstruction(options.systemPrompt) : options.systemPrompt;

    const messages: { role: 'system' | 'user'; content: string }[] = [];
    if (systemPrompt !== undefined && systemPrompt.trim().length > 0) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const body: Record<string, unknown> = {
      messages,
      stream: false,
      max_tokens: options.maxTokens ?? 256,
      temperature: options.temperature ?? 0.1,
    };
    if (wantsJson && supportsJsonMode(model)) {
      body['response_format'] = { type: 'json_object' };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(
        `${WORKERS_AI_BASE_URL}/accounts/${encodeURIComponent(accountId.trim())}/ai/run/${model.trim()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiToken}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
    } catch (error: unknown) {
      if (isAbortError(error)) {
        throw new Error(`Cloudflare Workers AI: timeout (${timeoutMs}ms)`);
      }
      throw new Error('Cloudflare Workers AI: no se pudo contactar el servicio');
    } finally {
      clearTimeout(timeoutId);
    }

    let payload: CloudflareAiPayload;
    try {
      payload = (await response.json()) as CloudflareAiPayload;
    } catch {
      throw new Error(`Cloudflare Workers AI: respuesta ilegible (HTTP ${response.status})`);
    }

    if (!response.ok || payload?.success === false) {
      throw new Error(this.buildErrorMessage(response.status, payload));
    }

    const raw = payload?.result?.response;

    if (wantsJson) {
      const jsonText = typeof raw === 'string' ? raw : JSON.stringify(raw ?? null);
      const parsed = parseJsonLoose(jsonText);
      if (parsed === undefined) {
        throw new Error('Cloudflare Workers AI: la respuesta del modelo no es JSON válido');
      }
      return JSON.stringify(parsed);
    }

    if (typeof raw === 'string') return raw.trim();
    return JSON.stringify(raw ?? '');
  }

  /** Añade la instrucción de JSON al prompt del sistema (si lo hay). */
  private withJsonInstruction(systemPrompt: string | undefined): string {
    if (systemPrompt === undefined || systemPrompt.trim().length === 0) return JSON_INSTRUCTION;
    return `${systemPrompt}\n\n${JSON_INSTRUCTION}`;
  }

  /** Mensaje de error controlado: código HTTP + descripción del código de error. */
  private buildErrorMessage(status: number, payload: CloudflareAiPayload | undefined): string {
    const codes = Array.isArray(payload?.errors)
      ? payload.errors
          .map((entry) => entry?.code)
          .filter((code): code is number => typeof code === 'number')
      : [];
    const details = codes
      .map((code) => ERROR_MESSAGES[code] ?? `error ${code}`)
      .filter((detail, index, all) => all.indexOf(detail) === index);
    const suffix = details.length > 0 ? ` - ${details.join('; ')}` : '';
    return `Cloudflare Workers AI: HTTP ${status}${suffix}`;
  }
}
