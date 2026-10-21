import { describe, expect, it, vi, afterEach } from "vitest";
import { isLlmProviderKind, resolveLlmProvider } from "./llm-provider.js";
import { validateConfig } from "./validate.js";

describe("LLM_PROVIDER: resolución del valor", () => {
  it("por defecto es ollama (IA local)", () => {
    expect(resolveLlmProvider(undefined)).toBe("ollama");
    expect(resolveLlmProvider("")).toBe("ollama");
    expect(resolveLlmProvider("   ")).toBe("ollama");
  });

  it("acepta ollama y cloudflare, sin distinguir mayúsculas", () => {
    expect(resolveLlmProvider("ollama")).toBe("ollama");
    expect(resolveLlmProvider("OLLAMA")).toBe("ollama");
    expect(resolveLlmProvider("cloudflare")).toBe("cloudflare");
    expect(resolveLlmProvider(" CLOUDFLARE ")).toBe("cloudflare");
  });

  it("un valor inválido cae en el valor por defecto (ollama)", () => {
    expect(resolveLlmProvider("gemini")).toBe("ollama");
    expect(isLlmProviderKind("gemini")).toBe(false);
    expect(isLlmProviderKind("cloudflare")).toBe(true);
  });
});

describe("validateConfig con LLM_PROVIDER", () => {
  const original = process.env;

  afterEach(() => {
    process.env = { ...original };
    vi.resetModules();
  });

  function setupProd(): void {
    process.env.NODE_ENV = "production";
    process.env.CHANNEL_MODE = "telegram";
    process.env.DATABASE_URL = "postgresql://u:p@h:5432/db?schema=public";
    process.env.TELEGRAM_BOT_TOKEN = "123456:ABC";
    process.env.TELEGRAM_WEBHOOK_SECRET = "mi_secreto-webhook-1";
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_APP_SECRET;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.LLM_MODEL;
  }

  it("con provider ollama no exige nada de Cloudflare", async () => {
    setupProd();
    process.env.LLM_PROVIDER = "ollama";
    const { validateConfig: v } = await import("./validate.js?llm-ollama");
    expect(v()).toEqual([]);
  });

  it("sin definir LLM_PROVIDER (IA local por defecto) tampoco exige nada de Cloudflare", async () => {
    setupProd();
    delete process.env.LLM_PROVIDER;
    const { validateConfig: v } = await import("./validate.js?llm-default");
    expect(v()).toEqual([]);
  });

  it("con provider cloudflare en producción exige account id, token y modelo", async () => {
    setupProd();
    process.env.LLM_PROVIDER = "cloudflare";
    const { validateConfig: v } = await import("./validate.js?llm-cloudflare");
    expect(v().map((e) => e.key).sort()).toEqual([
      "CLOUDFLARE_ACCOUNT_ID",
      "CLOUDFLARE_API_TOKEN",
      "LLM_MODEL",
    ]);
  });

  it("con provider cloudflare completo no reporta incidencias", async () => {
    setupProd();
    process.env.LLM_PROVIDER = "cloudflare";
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct1234567890abcdef";
    process.env.CLOUDFLARE_API_TOKEN = "token-de-prueba-no-real";
    process.env.LLM_MODEL = "@cf/meta/llama-3.2-3b-instruct";
    const { validateConfig: v } = await import("./validate.js?llm-cloudflare-ok");
    expect(v()).toEqual([]);
  });

  it("un LLM_PROVIDER inválido es incidencia en cualquier entorno", async () => {
    process.env.NODE_ENV = "development";
    process.env.LLM_PROVIDER = "gemini";
    const { validateConfig: v } = await import("./validate.js?llm-invalid");
    expect(v().map((e) => e.key)).toContain("LLM_PROVIDER");
  });
});

describe("env.llmProvider", () => {
  const original = process.env;

  afterEach(() => {
    process.env = { ...original };
    vi.resetModules();
  });

  it("por defecto es ollama y llmModel queda vacío", async () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL;
    const { env } = await import("./env.js?llm-env-default");
    expect(env.llmProvider).toBe("ollama");
    expect(env.llmModel).toBe("");
  });

  it("lee el proveedor y el modelo configurados", async () => {
    process.env.LLM_PROVIDER = "cloudflare";
    process.env.LLM_MODEL = "@cf/meta/llama-3.2-3b-instruct";
    const { env } = await import("./env.js?llm-env-cloudflare");
    expect(env.llmProvider).toBe("cloudflare");
    expect(env.llmModel).toBe("@cf/meta/llama-3.2-3b-instruct");
  });
});
