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
}

const hasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
};

const MINUTE = 60_000;
const PASSWORD = "contrasena-de-prueba-123";
const CHAT_ID = "570123456789";

describe("ChatLoginUseCase con TELEGRAM_SKIP_PHONE_MATCH", () => {
  let clock: MutableClock;
  let users: InMemoryCompanyUserRepository;
  let links: InMemoryLoginLinkRepository;
  let sessions: InMemoryChatSessionRepository;
  let audit: InMemoryAuditWriter;

  beforeEach(() => {
    clock = new MutableClock(new Date("2026-01-01T10:00:00.000Z"));
    users = new InMemoryCompanyUserRepository();
    links = new InMemoryLoginLinkRepository();
    sessions = new InMemoryChatSessionRepository(users);
    audit = new InMemoryAuditWriter();
  });

  function makeUseCase(skipPhoneMatchForTelegram: boolean): ChatLoginUseCase {
    return new ChatLoginUseCase({
      companyUsers: users,
      links,
      sessions: new ChatSessionService({
        repository: sessions,
        clock,
        idleMs: 20 * MINUTE,
        absoluteMs: 8 * 60 * MINUTE,
      }),
      hasher,
      clock,
      audit,
      notifier: { send: async () => undefined },
      fillerHash: Promise.resolve("hash:relleno"),
      requirePhoneMatch: true,
      skipPhoneMatchForTelegram,
    });
  }

  const validTokenValue = "b".repeat(43);

  function addTelegramLink() {
    return links.addLink({
      tokenHash: hashToken(validTokenValue),
      channel: "TELEGRAM",
      contactId: CHAT_ID,
      expiresAt: new Date(clock.now().getTime() + 10 * MINUTE),
      usedAt: null,
    });
  }

  it("con skip activo permite el login en TELEGRAM aunque el teléfono no coincida", async () => {
    users.addUser({
      username: "ana",
      passwordHash: `hash:${PASSWORD}`,
      registeredPhone: "570000000999",
    });
    addTelegramLink();

    const result = await makeUseCase(true).execute({
      username: "ana",
      password: PASSWORD,
      token: validTokenValue,
      ip: "1.2.3.4",
    });
    expect(result.channel).toBe("TELEGRAM");
    expect(await sessions.findActiveByContact("TELEGRAM", CHAT_ID)).not.toBeNull();
  });

  it("con skip desactivado el teléfono sigue exigiéndose en TELEGRAM", async () => {
    users.addUser({
      username: "ana",
      passwordHash: `hash:${PASSWORD}`,
      registeredPhone: "570000000999",
    });
    addTelegramLink();

    await expect(
      makeUseCase(false).execute({ username: "ana", password: PASSWORD, token: validTokenValue, ip: "1.2.3.4" }),
    ).rejects.toBeInstanceOf(ChatInvalidCredentialsError);
    expect(audit.entries[0]?.metadata).toMatchObject({ reason: "phone_mismatch" });
  });

  it("con skip activo el teléfono sigue exigiéndose en otros canales (WEB)", async () => {
    users.addUser({
      username: "ana",
      passwordHash: `hash:${PASSWORD}`,
      registeredPhone: "570000000999",
    });
    links.addLink({
      tokenHash: hashToken(validTokenValue),
      channel: "WEB",
      contactId: "570000000001",
      expiresAt: new Date(clock.now().getTime() + 10 * MINUTE),
      usedAt: null,
    });

    await expect(
      makeUseCase(true).execute({ username: "ana", password: PASSWORD, token: validTokenValue, ip: "1.2.3.4" }),
    ).rejects.toBeInstanceOf(ChatInvalidCredentialsError);
    expect(audit.entries[0]?.metadata).toMatchObject({ reason: "phone_mismatch" });
  });
});
