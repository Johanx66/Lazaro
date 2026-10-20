import { beforeEach, describe, expect, it } from "vitest";
import type { Clock } from "../domain/clock.js";
import { GenerateLoginLinkUseCase } from "../application/use-cases/generate-login-link.js";
import { ValidateLoginLinkUseCase } from "../application/use-cases/validate-login-link.js";
import { hashToken } from "../application/tokens.js";
import {
  InMemoryAuditWriter,
  InMemoryLoginLinkRepository,
} from "./in-memory-identity-repository.js";

class MutableClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

const MINUTE = 60_000;

describe("enlaces de login", () => {
  let clock: MutableClock;
  let links: InMemoryLoginLinkRepository;
  let audit: InMemoryAuditWriter;
  let generate: GenerateLoginLinkUseCase;
  let validate: ValidateLoginLinkUseCase;

  beforeEach(() => {
    clock = new MutableClock(new Date("2026-01-01T10:00:00.000Z"));
    links = new InMemoryLoginLinkRepository();
    audit = new InMemoryAuditWriter();
    generate = new GenerateLoginLinkUseCase({
      repository: links,
      clock,
      ttlMs: 10 * MINUTE,
      publicBaseUrl: "https://example.test",
      audit,
    });
    validate = new ValidateLoginLinkUseCase({ repository: links, clock });
  });

  it("genera una URL /login?t=<token> y guarda solo el hash, nunca el token", async () => {
    const { url } = await generate.execute({ channel: "WEB", contactId: "570000000001" });
    expect(url.startsWith("https://example.test/login?t=")).toBe(true);

    const token = new URL(url).searchParams.get("t");
    expect(token).toBeTruthy();

    const stored = await links.findByTokenHash(hashToken(token ?? ""));
    expect(stored).not.toBeNull();
    // Lo guardado es el hash, nunca el token en claro.
    expect(stored?.tokenHash).toBe(hashToken(token ?? ""));
    expect(stored?.tokenHash).not.toBe(token);
  });

  it("valida un enlace vigente y devuelve el contacto enmascarado", async () => {
    const { url } = await generate.execute({ channel: "WEB", contactId: "570000000001" });
    const token = new URL(url).searchParams.get("t") ?? "";
    const result = await validate.execute(token);
    expect(result).toEqual({
      channel: "WEB",
      contactId: "570000000001",
      maskedContact: "****0001",
    });
  });

  it("rechaza un enlace vencido", async () => {
    const { url } = await generate.execute({ channel: "WEB", contactId: "570000000001" });
    const token = new URL(url).searchParams.get("t") ?? "";
    clock.advance(11 * MINUTE);
    expect(await validate.execute(token)).toBeNull();
  });

  it("rechaza un enlace ya usado", async () => {
    const { url } = await generate.execute({ channel: "WEB", contactId: "570000000001" });
    const token = new URL(url).searchParams.get("t") ?? "";
    const link = await links.findByTokenHash(hashToken(token));
    await links.markUsed(link!.id, clock.now());
    expect(await validate.execute(token)).toBeNull();
  });

  it("al pedir un enlace nuevo, invalida los anteriores del mismo contacto", async () => {
    const first = await generate.execute({ channel: "WEB", contactId: "570000000001" });
    const firstToken = new URL(first.url).searchParams.get("t") ?? "";
    const second = await generate.execute({ channel: "WEB", contactId: "570000000001" });
    const secondToken = new URL(second.url).searchParams.get("t") ?? "";

    expect(await validate.execute(firstToken)).toBeNull();
    expect(await validate.execute(secondToken)).not.toBeNull();
  });

  it("rechaza tokens mal formados sin tocar el repositorio", async () => {
    expect(await validate.execute("no-es-un-token")).toBeNull();
  });

  it("registra la generación en la auditoría sin incluir el token", async () => {
    await generate.execute({ channel: "WEB", contactId: "570000000001" });
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]?.action).toBe("LOGIN_LINK_CREATED");
    expect(JSON.stringify(audit.entries)).not.toContain("login?t=");
  });
});
