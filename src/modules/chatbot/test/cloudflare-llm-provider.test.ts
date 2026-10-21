import { describe, it, expect, vi, afterEach } from 'vitest';
import { CloudflareLlmProvider } from '../infrastructure/cloudflare-llm-provider.js';
import { createLlmProvider } from '../infrastructure/create-llm-provider.js';
import { OllamaLlmProvider } from '../infrastructure/ollama-llm-provider.js';
import { IntentClassifier } from '../application/intent-classifier.js';

const ACCOUNT_ID = 'acct1234567890abcdef';
const API_TOKEN = 'token-de-prueba-no-real';
const MODEL = '@cf/meta/llama-3.2-3b-instruct';

function provider(overrides: Partial<{ accountId: string; apiToken: string; model: string; timeoutMs: number }> = {}) {
  return new CloudflareLlmProvider({
    accountId: ACCOUNT_ID,
    apiToken: API_TOKEN,
    model: MODEL,
    timeoutMs: 1000,
    ...overrides,
  });
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function lastRequestBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fetchMock.mock.calls[0];
  const init = call?.[1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('FASE 5 — Proveedor de Cloudflare Workers AI', () => {
  it('1. Éxito: devuelve el texto del modelo y llama a la API con el token en la cabecera', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ success: true, result: { response: '  Hola, tu pedido va en camino.  ' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await provider().generateCompletion('¿Cómo va mi pedido?');

    expect(result).toBe('Hola, tu pedido va en camino.');
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${MODEL}`,
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${API_TOKEN}`);
    expect(init.method).toBe('POST');
  });

  it('2. jsonMode con modelo que soporta JSON Mode: envía response_format y normaliza la respuesta', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ success: true, result: { response: '```json\n{"intent":"FAQ"}\n```' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await provider({ model: '@cf/meta/llama-3.1-8b-instruct' }).generateCompletion('clasifica', {
      jsonMode: true,
    });

    expect(result).toBe('{"intent":"FAQ"}');
    const body = lastRequestBody(fetchMock);
    expect(body['response_format']).toEqual({ type: 'json_object' });
  });

  it('3. jsonMode con modelo SIN JSON Mode: instruye el JSON en el system prompt y parsea tolerante', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ success: true, result: { response: 'Aquí tienes el JSON: {"intent":"FAQ"}' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await provider().generateCompletion('clasifica', {
      jsonMode: true,
      systemPrompt: 'Eres un clasificador de intenciones.',
    });

    expect(result).toBe('{"intent":"FAQ"}');
    const body = lastRequestBody(fetchMock);
    expect(body['response_format']).toBeUndefined();
    const messages = body['messages'] as { role: string; content: string }[];
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain('Eres un clasificador de intenciones.');
    expect(messages[0]?.content).toContain('JSON');
    expect(messages[1]?.role).toBe('user');
    expect(messages[1]?.content).toBe('clasifica');
  });

  it('4. JSON inválido: lanza error para que el bot transfiera a asesor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, result: { response: 'esto no es json' } })));

    await expect(provider().generateCompletion('clasifica', { jsonMode: true })).rejects.toThrow(
      /no es JSON válido/i,
    );
  });

  it('5. JSON inválido: el clasificador deriva en PEDIR_HUMANO (el bot no se cae)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, result: { response: 'esto no es json' } })));

    const classifier = new IntentClassifier(provider());

    const result = await classifier.classify('¿Cuál es el estado de mi pedido 123?');

    expect(result.intent).toBe('PEDIR_HUMANO');
  });

  it('6. Timeout: se aborta la petición y se lanza un error controlado', async () => {
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(provider({ timeoutMs: 10 }).generateCompletion('hola')).rejects.toThrow(/timeout/i);
  });

  it('7. Token ausente: falla sin llamar a la API', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ success: true, result: { response: 'nada' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(provider({ apiToken: '' }).generateCompletion('hola')).rejects.toThrow(
      /CLOUDFLARE_API_TOKEN/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('8. Sin account id ni modelo: falla con un error controlado', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ success: true, result: { response: 'nada' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(provider({ accountId: '' }).generateCompletion('hola')).rejects.toThrow(
      /CLOUDFLARE_ACCOUNT_ID/,
    );
    await expect(provider({ model: '' }).generateCompletion('hola')).rejects.toThrow(/LLM_MODEL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('9. Cuota diaria agotada (HTTP 429): error controlado que no filtra el token ni el prompt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          {
            success: false,
            errors: [{ code: 3036, message: 'You have used up your daily free allocation of 10,000 neurons.' }],
            result: null,
          },
          429,
        ),
      ),
    );

    const prompt = 'dame el estado del pedido 123';
    const error = await provider()
      .generateCompletion(prompt)
      .then(() => null)
      .catch((caught: unknown) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain('HTTP 429');
    expect(error?.message).toContain('cuota diaria gratuita agotada');
    expect(error?.message).not.toContain(API_TOKEN);
    expect(error?.message).not.toContain(prompt);
  });

  it('10. Respuesta ilegible: error controlado sin el contenido recibido', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('esto no es json', { status: 200 })));

    await expect(provider().generateCompletion('hola')).rejects.toThrow(/respuesta ilegible/i);
  });

  it('11. Error de red: error controlado (no se propaga la excepción original)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );

    const error = await provider()
      .generateCompletion('hola')
      .then(() => null)
      .catch((caught: unknown) => caught as Error);

    expect(error?.message).toBe('Cloudflare Workers AI: no se pudo contactar el servicio');
  });
});

describe('FASE 5 — Selección del proveedor de IA', () => {
  const base = {
    timeoutMs: 1000,
    ollamaBaseUrl: 'http://127.0.0.1:11434',
    ollamaModel: 'qwen2.5:7b-instruct',
    cloudflareAccountId: ACCOUNT_ID,
    cloudflareApiToken: API_TOKEN,
    llmModel: MODEL,
  };

  it('1. provider "ollama" (por defecto y en producción): devuelve el adaptador de Ollama', () => {
    const created = createLlmProvider({ ...base, provider: 'ollama' });

    expect(created).toBeInstanceOf(OllamaLlmProvider);
  });

  it('2. provider "cloudflare": devuelve el adaptador de Workers AI', () => {
    const created = createLlmProvider({ ...base, provider: 'cloudflare' });

    expect(created).toBeInstanceOf(CloudflareLlmProvider);
  });

  it('3. provider "cloudflare" sin credenciales: falla al arrancar (fail fast)', () => {
    expect(() =>
      createLlmProvider({ ...base, provider: 'cloudflare', cloudflareApiToken: '' }),
    ).toThrow(/CLOUDFLARE_API_TOKEN/);
    expect(() =>
      createLlmProvider({ ...base, provider: 'cloudflare', llmModel: '' }),
    ).toThrow(/LLM_MODEL/);
    expect(() =>
      createLlmProvider({ ...base, provider: 'cloudflare', cloudflareAccountId: '' }),
    ).toThrow(/CLOUDFLARE_ACCOUNT_ID/);
  });
});
