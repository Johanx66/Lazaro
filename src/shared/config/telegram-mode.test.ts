import { describe, expect, it, vi, afterEach } from "vitest";
import {
  isChannelMode,
  modeIncludesTelegram,
  modeIncludesWeb,
  modeIncludesWhatsapp,
  resolveChannelMode,
  splitChannelTokens,
} from "./channel-mode.js";
import { validateConfig } from "./validate.js";

describe("channel-mode con telegram", () => {
  it("acepta telegram como token suelto", () => {
    expect(isChannelMode("telegram")).toBe(true);
    expect(modeIncludesTelegram("telegram")).toBe(true);
    expect(modeIncludesWhatsapp("telegram")).toBe(false);
    expect(modeIncludesWeb("telegram")).toBe(false);
  });

  it("acepta listas separadas por comas", () => {
    expect(isChannelMode("whatsapp,telegram")).toBe(true);
    expect(isChannelMode(" web , telegram ")).toBe(true);
    expect(modeIncludesTelegram("whatsapp,telegram")).toBe(true);
    expect(modeIncludesWhatsapp("whatsapp,telegram")).toBe(true);
    expect(modeIncludesWeb("web,telegram")).toBe(true);
  });

  it("el alias both no incluye telegram pero sí web y whatsapp", () => {
    expect(isChannelMode("both")).toBe(true);
    expect(modeIncludesTelegram("both")).toBe(false);
    expect(modeIncludesWeb("both")).toBe(true);
    expect(modeIncludesWhatsapp("both")).toBe(true);
  });

  it("rechaza tokens desconocidos o listas vacías", () => {
    expect(isChannelMode("telegramm")).toBe(false);
    expect(isChannelMode("telegram,webb")).toBe(false);
    expect(isChannelMode("")).toBe(false);
    expect(isChannelMode("both,telegram")).toBe(false);
  });

  it("normalizea y mantiene el fallback por entorno", () => {
    expect(resolveChannelMode(" TELEGRAM ", "development")).toBe("telegram");
    expect(resolveChannelMode("WEB,TELEGRAM", "development")).toBe("web,telegram");
    expect(resolveChannelMode(undefined, "production")).toBe("whatsapp");
    expect(resolveChannelMode("", "development")).toBe("both");
  });

  it("splitChannelTokens no expande el alias both", () => {
    expect(splitChannelTokens("both")).toEqual(["both"]);
    expect(splitChannelTokens("web,telegram")).toEqual(["web", "telegram"]);
  });
});

describe("validateConfig con telegram en producción", () => {
  const original = process.env;

  afterEach(() => {
    process.env = { ...original };
    vi.resetModules();
  });

  function setupProdMode(mode: string): void {
    process.env.NODE_ENV = "production";
    process.env.CHANNEL_MODE = mode;
    process.env.DATABASE_URL = "postgresql://u:p@h:5432/db?schema=public";
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_APP_SECRET;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.TELEGRAM_SKIP_PHONE_MATCH;
  }

  it("telegram solo exige sus propias variables, no las de WhatsApp", async () => {
    setupProdMode("telegram");
    const { validateConfig: v } = await import("./validate.js?prod-telegram");
    expect(v().map((e) => e.key)).toEqual(["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET"]);
  });

  it("telegram completo en producción → sin incidencias", async () => {
    setupProdMode("telegram");
    process.env.TELEGRAM_BOT_TOKEN = "123456:ABC-def_ghi";
    process.env.TELEGRAM_WEBHOOK_SECRET = "mi_secreto-webhook-1";
    const { validateConfig: v } = await import("./validate.js?prod-telegram-ok");
    expect(v()).toEqual([]);
  });

  it("rechaza un TELEGRAM_WEBHOOK_SECRET con caracteres fuera del formato de Telegram", async () => {
    setupProdMode("telegram");
    process.env.TELEGRAM_BOT_TOKEN = "123456:ABC";
    process.env.TELEGRAM_WEBHOOK_SECRET = "secreto con espacios";
    const { validateConfig: v } = await import("./validate.js?prod-telegram-badsecret");
    expect(v().map((e) => e.key)).toEqual(["TELEGRAM_WEBHOOK_SECRET"]);
  });

  it("whatsapp,telegram en producción exige variables de ambos canales", async () => {
    setupProdMode("whatsapp,telegram");
    const { validateConfig: v } = await import("./validate.js?prod-mixed");
    expect(v().map((e) => e.key).sort()).toEqual([
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_WEBHOOK_SECRET",
      "WHATSAPP_ACCESS_TOKEN",
      "WHATSAPP_APP_SECRET",
      "WHATSAPP_PHONE_NUMBER_ID",
      "WHATSAPP_VERIFY_TOKEN",
    ]);
  });

  it("web,telegram se rechaza en producción (cualquier modo con el token web)", async () => {
    setupProdMode("web,telegram");
    const { validateConfig: v } = await import("./validate.js?prod-webtelegram");
    const missing = v();
    expect(missing).toHaveLength(1);
    expect(missing[0]?.key).toBe("CHANNEL_MODE");
  });

  it("TELEGRAM_SKIP_PHONE_MATCH inválido → incidencia en cualquier entorno", async () => {
    process.env.NODE_ENV = "development";
    process.env.TELEGRAM_SKIP_PHONE_MATCH = "si";
    const { validateConfig: v } = await import("./validate.js?skip-bad");
    expect(v().map((e) => e.key)).toContain("TELEGRAM_SKIP_PHONE_MATCH");
  });
});

describe("env.telegramSkipPhoneMatch", () => {
  const original = process.env;

  afterEach(() => {
    process.env = { ...original };
    vi.resetModules();
  });

  it("por defecto es false", async () => {
    delete process.env.TELEGRAM_SKIP_PHONE_MATCH;
    const { env } = await import("./env.js?skip-default");
    expect(env.telegramSkipPhoneMatch).toBe(false);
  });

  it('interpreta "true" como true y "false" como false', async () => {
    process.env.TELEGRAM_SKIP_PHONE_MATCH = "true";
    const { env: envTrue } = await import("./env.js?skip-true");
    expect(envTrue.telegramSkipPhoneMatch).toBe(true);
    process.env.TELEGRAM_SKIP_PHONE_MATCH = "false";
    const { env: envFalse } = await import("./env.js?skip-false");
    expect(envFalse.telegramSkipPhoneMatch).toBe(false);
  });
});
