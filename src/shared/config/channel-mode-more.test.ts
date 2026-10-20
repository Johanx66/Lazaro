import { describe, expect, it, vi, afterEach } from "vitest";
import { validateConfig } from "./validate.js";

describe("CHANNEL_MODE producción y defaults", () => {
  const original = process.env;

  afterEach(() => {
    process.env = { ...original };
    vi.resetModules();
  });

  it("web en producción → FALLA (el simulador no se monta en producción)", async () => {
    process.env.NODE_ENV = "production";
    process.env.CHANNEL_MODE = "web";
    process.env.DATABASE_URL = "postgresql://x";
    const { validateConfig: v } = await import("./validate.js?webprod");
    const missing = v();
    expect(missing).toHaveLength(1);
    expect(missing[0]?.key).toBe("CHANNEL_MODE");
  });

  it("CHANNEL_MODE inválido → FALLA en cualquier entorno", async () => {
    process.env.NODE_ENV = "development";
    process.env.CHANNEL_MODE = "webb";
    const { validateConfig: v } = await import("./validate.js?invalid");
    const missing = v();
    expect(missing).toHaveLength(1);
    expect(missing[0]?.key).toBe("CHANNEL_MODE");
  });

  it("whatsapp en producción → SÍ exige variables de WhatsApp", async () => {
    process.env.NODE_ENV = "production";
    process.env.CHANNEL_MODE = "whatsapp";
    process.env.DATABASE_URL = "postgresql://x";
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    const { validateConfig: v } = await import("./validate.js?wprod");
    const missing = v();
    expect(missing.length).toBeGreaterThan(0);
  });

  it("both en producción → SÍ exige variables de WhatsApp", async () => {
    process.env.NODE_ENV = "production";
    process.env.CHANNEL_MODE = "both";
    process.env.DATABASE_URL = "postgresql://x";
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    const { validateConfig: v } = await import("./validate.js?bprod");
    const missing = v();
    expect(missing.length).toBeGreaterThan(0);
  });

  it("defaults: dev → both, prod → whatsapp", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.CHANNEL_MODE;
    const { env: envDev } = await import("./env.js?devd");
    expect(envDev.channelMode).toBe("both");
    process.env.NODE_ENV = "production";
    delete process.env.CHANNEL_MODE;
    const { env: envProd } = await import("./env.js?prodd");
    expect(envProd.channelMode).toBe("whatsapp");
  });
});