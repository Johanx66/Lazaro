import { afterEach, describe, expect, it } from "vitest";
import { parseAllowedOrigins, validateAllowedOrigins } from "../config/allowed-origins.js";
import { validateConfig } from "../config/validate.js";

describe("parseAllowedOrigins", () => {
  it("devuelve lista vacía con valor vacío o ausente", () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins("")).toEqual([]);
    expect(parseAllowedOrigins(" , ,, ")).toEqual([]);
  });

  it("recorta espacios y descarta entradas vacías", () => {
    expect(parseAllowedOrigins("  https://a.example , ,https://b.example  ")).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
  });

  it("elimina duplicados conservando el orden", () => {
    expect(parseAllowedOrigins("https://a.example,https://b.example, https://a.example")).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
  });
});

describe("validateAllowedOrigins", () => {
  it("acepta orígenes https exactos", () => {
    expect(validateAllowedOrigins(["https://panel.empresa.example", "https://a.example:8443"], "production")).toEqual([]);
  });

  it('rechaza "*"', () => {
    expect(validateAllowedOrigins(["*"], "development")).toHaveLength(1);
    expect(validateAllowedOrigins(["*"], "production")).toHaveLength(1);
  });

  it("rechaza orígenes con ruta", () => {
    expect(validateAllowedOrigins(["https://a.example/panel"], "production")).toHaveLength(1);
  });

  it("rechaza orígenes con barra final", () => {
    expect(validateAllowedOrigins(["https://a.example/"], "production")).toHaveLength(1);
  });

  it("rechaza esquemas inválidos y textos que no son URL", () => {
    expect(validateAllowedOrigins(["ftp://a.example"], "development")).toHaveLength(1);
    expect(validateAllowedOrigins(["a.example"], "development")).toHaveLength(1);
    expect(validateAllowedOrigins(["javascript:alert(1)"], "development")).toHaveLength(1);
  });

  it("rechaza http:// en producción, incluso en localhost", () => {
    expect(validateAllowedOrigins(["http://a.example"], "production")).toHaveLength(1);
    expect(validateAllowedOrigins(["http://localhost:5173"], "production")).toHaveLength(1);
  });

  it("en desarrollo acepta http://localhost y http://127.0.0.1 con cualquier puerto", () => {
    expect(validateAllowedOrigins(["http://localhost", "http://localhost:5173", "http://127.0.0.1:3000"], "development")).toEqual([]);
  });

  it("en desarrollo rechaza http:// con otros hosts", () => {
    expect(validateAllowedOrigins(["http://a.example"], "development")).toHaveLength(1);
  });
});

describe("validateConfig con ALLOWED_ORIGINS", () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  function productionBase(): void {
    process.env.DATABASE_URL = "postgresql://u:p@h:5432/db?schema=public";
    process.env.WHATSAPP_VERIFY_TOKEN = "t";
    process.env.WHATSAPP_ACCESS_TOKEN = "t";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1";
    process.env.WHATSAPP_APP_SECRET = "s";
    delete process.env.CHANNEL_MODE;
  }

  it("lista vacía no genera pendientes", () => {
    productionBase();
    delete process.env.ALLOWED_ORIGINS;
    expect(validateConfig("production")).toEqual([]);
  });

  it("rechaza http:// en producción", () => {
    productionBase();
    process.env.ALLOWED_ORIGINS = "http://panel.empresa.example";
    expect(validateConfig("production").map((e) => e.key)).toEqual(["ALLOWED_ORIGINS"]);
  });

  it("acepta https:// en producción", () => {
    productionBase();
    process.env.ALLOWED_ORIGINS = "https://panel.empresa.example";
    expect(validateConfig("production")).toEqual([]);
  });

  it("acepta http://localhost en desarrollo", () => {
    process.env.ALLOWED_ORIGINS = "http://localhost:5173";
    expect(validateConfig("development")).toEqual([]);
  });

  it('rechaza "*" en desarrollo', () => {
    process.env.ALLOWED_ORIGINS = "*";
    expect(validateConfig("development").map((e) => e.key)).toEqual(["ALLOWED_ORIGINS"]);
  });
});
