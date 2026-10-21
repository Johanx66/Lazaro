import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PasswordHasher } from "../../../shared/domain/password-hasher.js";
import {
  ProcessIncomingMessageUseCase,
  UNVERIFIED_REPLY,
} from "../../../bot/application/process-incoming-message.js";
import type {
  ChatIdentityPort,
  DataQueryPort,
  InboundConversationPorts,
  IntentClassifierPort,
} from "../../../bot/application/process-incoming-message.js";
import { ChatSessionService } from "../application/chat-session-service.js";
import { hashToken } from "../application/tokens.js";
import { ChatLoginUseCase } from "../application/use-cases/chat-login.js";
import { UpdateCompanyUserUseCase } from "../application/use-cases/update-company-user.js";
import {
  InMemoryAuditWriter,
  InMemoryChatSessionRepository,
  InMemoryCompanyUserRepository,
  InMemoryLoginLinkRepository,
} from "./in-memory-identity-repository.js";

const hasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
};

const MINUTE = 60_000;
const PASSWORD = "contrasena-de-prueba-123";
const TOKEN = "a".repeat(43);
const CONTACT_ID = "570000000001";
const LOGIN_URL = "https://app.example/login?t=token-nuevo";

function makeConversations(): InboundConversationPorts {
  return {
    startConversation: async (input) => ({
      id: "c1",
      userId: input.userId,
      channel: input.channel,
      status: "BOT_HANDLING",
      assignedAgentId: null,
      startedAt: new Date(),
      endedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    sendMessage: async () => ({
      conversationId: "c1",
      message: {
        id: "m1",
        conversationId: "c1",
        senderType: "USER",
        content: "x",
        metadata: null,
        createdAt: new Date(),
      },
      status: "BOT_HANDLING",
    }),
    recordBotReply: async (_conversationId, content) => ({
      conversationId: "c1",
      message: {
        id: "m2",
        conversationId: "c1",
        senderType: "BOT",
        content,
        metadata: null,
        createdAt: new Date(),
      },
      status: "WAITING_USER",
    }),
    handleNonTextEvent: async () => ({
      conversationId: "c1",
      appliedEvent: "TRANSFERRED_TO_HUMAN",
      message: {
        id: "m3",
        conversationId: "c1",
        senderType: "SYSTEM",
        content: "x",
        metadata: null,
        createdAt: new Date(),
      },
      status: "WAITING_AGENT",
    }),
  };
}

describe("cambio de teléfono registrado del cliente", () => {
  let clock: { now: () => Date };
  let users: InMemoryCompanyUserRepository;
  let links: InMemoryLoginLinkRepository;
  let audit: InMemoryAuditWriter;
  let sessions: ChatSessionService;
  let classify: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clock = { now: () => new Date("2026-01-01T10:00:00.000Z") };
    users = new InMemoryCompanyUserRepository();
    links = new InMemoryLoginLinkRepository();
    audit = new InMemoryAuditWriter();
    sessions = new ChatSessionService({
      repository: new InMemoryChatSessionRepository(users),
      clock,
      idleMs: 20 * MINUTE,
      absoluteMs: 8 * 60 * MINUTE,
    });
    classify = vi.fn(async () => ({ intent: "FAQ" as const }));
  });

  function makeIdentity(): ChatIdentityPort {
    return {
      getActiveSessionName: async (channel, contactId) => {
        const found = await sessions.getActive(channel, contactId);
        return found ? found.owner.displayName : null;
      },
      getActivePrincipal: async (channel, contactId) => {
        const found = await sessions.getActive(channel, contactId);
        if (!found) return null;
        return {
          companyUserId: found.owner.id,
          displayName: found.owner.displayName,
          role: found.owner.role,
        };
      },
      startLogin: async () => ({ status: "issued" as const, url: LOGIN_URL }),
      logout: async () => undefined,
    };
  }

  function makeBot(): ProcessIncomingMessageUseCase {
    const classifier: IntentClassifierPort = { classify };
    const dataQuery: DataQueryPort = { execute: async () => ({ reply: "datos" }) };
    return new ProcessIncomingMessageUseCase({
      users: { findOrCreateUser: async () => ({ id: "u1" }) },
      conversations: makeConversations(),
      knowledge: { findAnswer: async () => "Tu saldo es 100." },
      transferAfterMisses: 3,
      classifier,
      dataQuery,
      identity: makeIdentity(),
    });
  }

  async function login(): Promise<void> {
    links.addLink({
      tokenHash: hashToken(TOKEN),
      channel: "WEB",
      contactId: CONTACT_ID,
      expiresAt: new Date(clock.now().getTime() + 10 * MINUTE),
      usedAt: null,
    });
    const chatLogin = new ChatLoginUseCase({
      companyUsers: users,
      links,
      sessions,
      hasher,
      clock,
      audit,
      notifier: { send: async () => undefined },
      fillerHash: Promise.resolve("hash:relleno"),
      requirePhoneMatch: false,
    });
    await chatLogin.execute({
      username: "ana",
      password: PASSWORD,
      token: TOKEN,
      ip: "1.2.3.4",
    });
  }

  it("el contacto anterior pierde la sesión y debe volver a verificarse", async () => {
    const user = users.addUser({
      username: "ana",
      passwordHash: `hash:${PASSWORD}`,
      displayName: "Ana",
      registeredPhone: CONTACT_ID,
    });
    await login();

    // 1. Con la sesión vigente el bot responde con normalidad.
    const bot = makeBot();
    const before = await bot.execute({
      channel: "WEB",
      contactId: CONTACT_ID,
      name: "Ana",
      text: "¿cuál es mi saldo?",
    });
    expect(before.handledByBot).toBe(true);
    expect(classify).toHaveBeenCalledTimes(1);

    // 2. El admin cambia el teléfono registrado del cliente.
    const update = new UpdateCompanyUserUseCase({ repository: users, hasher, audit, sessions });
    await update.execute({
      id: user.id,
      registeredPhone: "570000000002",
      adminId: "admin-1",
    });

    // 3. La sesión del contacto anterior queda revocada.
    expect(await sessions.getActive("WEB", CONTACT_ID)).toBeNull();

    // 4. El siguiente mensaje del mismo contacto vuelve a la puerta de verificación.
    classify.mockClear();
    const after = await bot.execute({
      channel: "WEB",
      contactId: CONTACT_ID,
      name: "Ana",
      text: "¿cuál es mi saldo?",
    });
    expect(after.handledByBot).toBe(false);
    expect(after.reply).toContain(UNVERIFIED_REPLY);
    expect(after.reply).toContain(LOGIN_URL);
    expect(classify).not.toHaveBeenCalled();
  });

  it("el cliente puede volver a verificarse con el teléfono nuevo", async () => {
    const user = users.addUser({
      username: "ana",
      passwordHash: `hash:${PASSWORD}`,
      displayName: "Ana",
      registeredPhone: CONTACT_ID,
    });
    await login();

    const update = new UpdateCompanyUserUseCase({ repository: users, hasher, audit, sessions });
    await update.execute({
      id: user.id,
      registeredPhone: "570000000002",
      adminId: "admin-1",
    });

    // Un enlace nuevo (el anterior se consumió) permite volver a entrar.
    const newToken = "b".repeat(43);
    links.addLink({
      tokenHash: hashToken(newToken),
      channel: "WEB",
      contactId: CONTACT_ID,
      expiresAt: new Date(clock.now().getTime() + 10 * MINUTE),
      usedAt: null,
    });
    const chatLogin = new ChatLoginUseCase({
      companyUsers: users,
      links,
      sessions,
      hasher,
      clock,
      audit,
      notifier: { send: async () => undefined },
      fillerHash: Promise.resolve("hash:relleno"),
      requirePhoneMatch: false,
    });
    await chatLogin.execute({
      username: "ana",
      password: PASSWORD,
      token: newToken,
      ip: "1.2.3.4",
    });

    const active = await sessions.getActive("WEB", CONTACT_ID);
    expect(active?.owner.id).toBe(user.id);
  });
});
