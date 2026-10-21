import { describe, expect, it } from "vitest";
import { redactLoginLinks } from "./redact-secrets.js";

describe("redactLoginLinks", () => {
  it("oculta el token de un enlace de login", () => {
    const text = "Verifica tu identidad: https://app.example/login?t=abc123_DEF-456";
    const redacted = redactLoginLinks(text);
    expect(redacted).not.toContain("abc123_DEF-456");
    expect(redacted).toContain("https://app.example/login?t=***");
  });

  it("oculta varios enlaces en el mismo texto", () => {
    const text = "a /login?t=token1 b /login?t=token2";
    const redacted = redactLoginLinks(text);
    expect(redacted).not.toContain("token1");
    expect(redacted).not.toContain("token2");
  });

  it("no modifica textos sin enlaces de login", () => {
    const text = "Hola, ¿cuál es el horario de atención?";
    expect(redactLoginLinks(text)).toBe(text);
  });
});
