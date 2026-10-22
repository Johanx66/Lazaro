import { describe, expect, it } from "vitest";

describe("validateConfig — Railway robustness (Fase 10)", () => {
  it("acepta TRUST_PROXY=1 en producción con telegram", async () => {
    const { validateConfig: v } = await import("./validate.js?railway-trust-proxy-1");
    const prev = process.env;
    process.env = {
      ...prev,
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://u:p@localhost:5432/db",
      CHANNEL_MODE: "telegram",
      TELEGRAM_BOT_TOKEN: "123:ABC",
      TELEGRAM_WEBHOOK_SECRET: "secret-token_123",
      PUBLIC_BASE_URL: "https://example.com",
      TRUST_PROXY: "1",
      ALLOWED_ORIGINS: "https://panel.example.com",
    };
    const issues = v("production");
    expect(issues.some((i) => i.key === "TRUST_PROXY")).toBe(false);
    process.env = prev;
  });

  it("acepta REQUIRE_PHONE_MATCH=1 y TELEGRAM_SKIP_PHONE_MATCH=0 en producción con telegram", async () => {
    const { validateConfig: v } = await import("./validate.js?railway-bools-1");
    const prev = process.env;
    process.env = {
      ...prev,
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://u:p@localhost:5432/db",
      CHANNEL_MODE: "telegram",
      TELEGRAM_BOT_TOKEN: "123:ABC",
      TELEGRAM_WEBHOOK_SECRET: "secret-token_123",
      PUBLIC_BASE_URL: "https://example.com",
      REQUIRE_PHONE_MATCH: "1",
      TELEGRAM_SKIP_PHONE_MATCH: "0",
      ALLOWED_ORIGINS: "https://panel.example.com",
    };
    const issues = v("production");
    expect(issues.some((i) => i.key === "REQUIRE_PHONE_MATCH")).toBe(false);
    expect(issues.some((i) => i.key === "TELEGRAM_SKIP_PHONE_MATCH")).toBe(false);
    process.env = prev;
  });

  it("PORT vacío no se reporta como inválido (se usa valor por defecto 3000)", async () => {
    const { validateConfig: v } = await import("./validate.js?railway-port-empty");
    const prev = process.env;
    process.env = {
      ...prev,
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://u:p@localhost:5432/db",
      CHANNEL_MODE: "telegram",
      TELEGRAM_BOT_TOKEN: "123:ABC",
      TELEGRAM_WEBHOOK_SECRET: "secret-token_123",
      PUBLIC_BASE_URL: "https://example.com",
      PORT: "",
      ALLOWED_ORIGINS: "https://panel.example.com",
    };
    const issues = v("production");
    expect(issues.some((i) => i.key === "PORT")).toBe(false);
    process.env = prev;
  });

  it("PORT no numérico sigue fallando en producción", async () => {
    const { validateConfig: v } = await import("./validate.js?railway-port-bad");
    const prev = process.env;
    process.env = {
      ...prev,
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://u:p@localhost:5432/db",
      CHANNEL_MODE: "telegram",
      TELEGRAM_BOT_TOKEN: "123:ABC",
      TELEGRAM_WEBHOOK_SECRET: "secret-token_123",
      PUBLIC_BASE_URL: "https://example.com",
      PORT: "abc",
      ALLOWED_ORIGINS: "https://panel.example.com",
    };
    const issues = v("production");
    expect(issues.some((i) => i.key === "PORT")).toBe(true);
    process.env = prev;
  });

  it("PORT fuera de rango sigue fallando", async () => {
    const { validateConfig: v } = await import("./validate.js?railway-port-range");
    const prev = process.env;
    process.env = {
      ...prev,
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://u:p@localhost:5432/db",
      CHANNEL_MODE: "telegram",
      TELEGRAM_BOT_TOKEN: "123:ABC",
      TELEGRAM_WEBHOOK_SECRET: "secret-token_123",
      PUBLIC_BASE_URL: "https://example.com",
      PORT: "70000",
      ALLOWED_ORIGINS: "https://panel.example.com",
    };
    const issues = v("production");
    expect(issues.some((i) => i.key === "PORT")).toBe(true);
    process.env = prev;
  });

  it("TELEGRAM_SKIP_PHONE_MATCH=true pasa en producción con telegram", async () => {
    const { validateConfig: v } = await import("./validate.js?railway-skip");
    const prev = process.env;
    process.env = {
      ...prev,
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://u:p@localhost:5432/db",
      CHANNEL_MODE: "telegram",
      TELEGRAM_BOT_TOKEN: "123:ABC",
      TELEGRAM_WEBHOOK_SECRET: "secret-token_123",
      PUBLIC_BASE_URL: "https://example.com",
      TELEGRAM_SKIP_PHONE_MATCH: "true",
      ALLOWED_ORIGINS: "https://panel.example.com",
    };
    const issues = v("production");
    expect(issues.some((i) => i.key === "TELEGRAM_SKIP_PHONE_MATCH")).toBe(false);
    process.env = prev;
  });
});
