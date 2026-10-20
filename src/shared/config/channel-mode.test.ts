import { describe, expect, it } from "vitest";
import { env } from "./env.js";
import { validateConfig } from "./validate.js";

describe("CHANNEL_MODE config", () => {
  it("env tiene channelMode por defecto", () => {
    expect(typeof env.channelMode).toBe("string");
  });

  it("validateConfig no exige WhatsApp si modo no incluye whatsapp (dev)", () => {
    const missing = validateConfig("development");
    expect(missing).toEqual([]);
  });
});