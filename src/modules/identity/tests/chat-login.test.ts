import { beforeEach, describe, expect, it } from "vitest";
import type { PasswordHasher } from "../../../shared/domain/password-hasher.js";
import { ChatSessionService } from "../application/chat-session-service.js";
import { ChatInvalidCredentialsError } from "../application/errors.js";
import { hashToken } from "../application/tokens.js";
import { ChatLoginUseCase } from "../application/use-cases/chat-login.js";
import type { Clock } from "../domain/clock.js";
import {
  InMemoryAuditWriter,
  InMemoryChatSessionRepository,
  InMemoryCompanyUserRepository,
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

const hasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
};

const MINUTE = 60_000;
const PASSWORD = "contrasena-de-prueba-123";

describe("ChatLoginUseCase", () => {
  let clock: MutableClock;
  let users: InMemoryCompanyUserRepository;
  let links: InMemoryLoginLinkRepository;
  let sessions: InMemoryChatSessionRepository;
  let audit: InMemoryAuditWriter;
  let notified: Array<{ channel: string; contactId: string; text: string }>;

  beforeEach(() => {
    clock = new MutableClock(new Date("2026-01-01T10:00:00.000Z"));
    users = new InMemoryCompanyUserRepository();
    links = new InMemoryLoginLinkRepository();
    sessions = new InMemoryChatSessionRepository(users);
    audit = new InMemoryAuditWriter();
    notified = [];
  });

  function makeUseCase(requirePhoneMatch: boolean): ChatLoginUseCase {
    const sessionService = new ChatSessionService({
      repository: sessions,
      clock,
      idleMs: 20 * MINUTE,
      absoluteMs: 8 * 60 * MINUTE,
    });
    return new ChatLoginUseCase({
      companyUsers: users,
      links,
      sessions: sessionService,
      hasher,
      clock,
      audit,
      notifier: {
        send: async (channel, contactId, text) => {
          notified.push({ channel, contactId, text });
        },
      },
      fillerHash: Promise.resolve("hash:relleno"),
      requirePhoneMatch,
    });
  }

  // Token con el formato esperado: 43 caracteres base64url.
  const validTokenValue = "a".repeat(43);

  function addLink(overrides: Partial<{ usedAt: Date | null; expiresAt: Date }> = {}) {
    return links.addLink({
      tokenHash: hashToken(validTokenValue),
      channel: "WEB",
      contactId: "570000000001",
      expiresAt: overrides.expiresAt ?? new Date(clock.now().getTime() + 10 * MINUTE),
      usedAt: overrides.usedAt ?? null,
    });
  }

  it("login correcto consume el enlace, crea la sesión y audita el éxito", async () => {
    users.addUser({ username: "ana", passwordHash: `hash:${PASSWORD}`, displayName: "Ana" });
    const link = addLink();

    const result = await makeUseCase(false).execute({
      username: "ana",
      password: PASSWORD,
      token: validTokenValue,
      ip: "1.2.3.4",
    });

    expect(result).toEqual({ displayName: "Ana", role: "USER", channel: "WEB" });
    expect(link.usedAt).not.toBeNull();

    const active = await sessions.findActiveByContact("WEB", "570000000001");
    expect(active?.owner.displayName).toBe("Ana");
    expect(audit.entries.map((e) => e.action)).toEqual(["LOGIN_SUCCESS", "CHAT_SESSION_CREATED"]);
    expect(notified).toEqual([
      { channel: "WEB", contactId: "570000000001", text: expect.stringContaining("Sesión iniciada como Ana") },
    ]);
  });

  it("usuario desconocido falla con error genérico y audita el motivo", async () => {
    addLink();
    await expect(
      makeUseCase(false).execute({ username: "nadie", password: PASSWORD, token: validTokenValue, ip: "1.2.3.4" }),
    ).rejects.toBeInstanceOf(ChatInvalidCredentialsError);
    expect(audit.entries[0]?.action).toBe("LOGIN_FAILED");
    expect(audit.entries[0]?.metadata).toMatchObject({ reason: "unknown_user" });
  });

  it("contraseña incorrecta incrementa fallos y no crea sesión", async () => {
    const user = users.addUser({ username: "ana", passwordHash: `hash:${PASSWORD}` });
    addLink();

    await expect(
      makeUseCase(false).execute({ username: "ana", password: "mala-mala-mala-mala", token: validTokenValue, ip: "1.2.3.4" }),
    ).rejects.toBeInstanceOf(ChatInvalidCredentialsError);

    expect(user.failedAttempts).toBe(1);
    expect(await sessions.findActiveByContact("WEB", "570000000001")).toBeNull();
    expect(audit.entries[0]?.metadata).toMatchObject({ reason: "wrong_password" });
  });

  it("bloquea la cuenta tras 5 fallos y luego rechaza la contraseña correcta", async () => {
    const user = users.addUser({ username: "ana", passwordHash: `hash:${PASSWORD}` });
    addLink();
    const useCase = makeUseCase(false);

    for (let i = 0; i < 5; i += 1) {
      await expect(
        useCase.execute({ username: "ana", password: "mala-mala-mala-mala", token: validTokenValue, ip: "1.2.3.4" }),
      ).rejects.toBeInstanceOf(ChatInvalidCredentialsError);
    }
    expect(user.lockedUntil).not.toBeNull();

    await expect(
      useCase.execute({ username: "ana", password: PASSWORD, token: validTokenValue, ip: "1.2.3.4" }),
    ).rejects.toBeInstanceOf(ChatInvalidCredentialsError);
    expect(audit.entries.at(-1)?.metadata).toMatchObject({ reason: "locked" });
  });

  it("rechaza un enlace ya usado con motivo invalid_link", async () => {
    users.addUser({ username: "ana", passwordHash: `hash:${PASSWORD}` });
    addLink({ usedAt: clock.now() });

    await expect(
      makeUseCase(false).execute({ username: "ana", password: PASSWORD, token: validTokenValue, ip: "1.2.3.4" }),
    ).rejects.toBeInstanceOf(ChatInvalidCredentialsError);
    expect(audit.entries[0]?.metadata).toMatchObject({ reason: "invalid_link" });
    expect(await sessions.findActiveByContact("WEB", "570000000001")).toBeNull();
  });

  it("rechaza un enlace vencido", async () => {
    users.addUser({ username: "ana", passwordHash: `hash:${PASSWORD}` });
    addLink({ expiresAt: new Date(clock.now().getTime() - 1) });

    await expect(
      makeUseCase(false).execute({ username: "ana", password: PASSWORD, token: validTokenValue, ip: "1.2.3.4" }),
    ).rejects.toBeInstanceOf(ChatInvalidCredentialsError);
    expect(audit.entries[0]?.metadata).toMatchObject({ reason: "invalid_link" });
  });

  it("rechaza usuario inactivo", async () => {
    users.addUser({ username: "ana", passwordHash: `hash:${PASSWORD}`, active: false });
    addLink();

    await expect(
      makeUseCase(false).execute({ username: "ana", password: PASSWORD, token: validTokenValue, ip: "1.2.3.4" }),
    ).rejects.toBeInstanceOf(ChatInvalidCredentialsError);
    expect(audit.entries[0]?.metadata).toMatchObject({ reason: "inactive_user" });
  });

  it("exige que el teléfono coincida cuando requirePhoneMatch está activo", async () => {
    users.addUser({
      username: "ana",
      passwordHash: `hash:${PASSWORD}`,
      registeredPhone: "570000000999",
    });
    addLink();

    await expect(
      makeUseCase(true).execute({ username: "ana", password: PASSWORD, token: validTokenValue, ip: "1.2.3.4" }),
    ).rejects.toBeInstanceOf(ChatInvalidCredentialsError);
    expect(audit.entries[0]?.metadata).toMatchObject({ reason: "phone_mismatch" });
  });

  it("permite login sin teléfono registrado cuando requirePhoneMatch está desactivado", async () => {
    users.addUser({ username: "ana", passwordHash: `hash:${PASSWORD}`, registeredPhone: null });
    addLink();

    const result = await makeUseCase(false).execute({
      username: "ana",
      password: PASSWORD,
      token: validTokenValue,
      ip: "1.2.3.4",
    });
    expect(result.channel).toBe("WEB");
  });

  it("nunca guarda el token ni la contraseña en la auditoría", async () => {
    users.addUser({ username: "ana", passwordHash: `hash:${PASSWORD}` });
    addLink();
    await makeUseCase(false).execute({
      username: "ana",
      password: PASSWORD,
      token: validTokenValue,
      ip: "1.2.3.4",
    });
    const serialized = JSON.stringify(audit.entries);
    expect(serialized).not.toContain(validTokenValue);
    expect(serialized).not.toContain(PASSWORD);
  });
});
