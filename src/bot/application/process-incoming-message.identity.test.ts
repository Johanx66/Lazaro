import { describe, expect, it } from "vitest";
import { ProcessIncomingMessageUseCase } from "./process-incoming-message.js";
import type {
  ChatIdentityPort,
  InboundConversationPorts,
  UserAccountPort,
} from "./process-incoming-message.js";

function makeConversations(): InboundConversationPorts {
  return {
    startConversation: async (input) => ({
      id: "c1",
      userId: input.userId,
      channel: input.channel,
      status: "CLOSED",
      assignedAgentId: null,
      startedAt: new Date(),
      endedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    sendMessage: async () => ({
      conversationId: "c1",
      message: { id: "m1", conversationId: "c1", senderType: "USER", content: "x", metadata: null, createdAt: new Date() },
      status: "BOT_HANDLING",
    }),
    recordBotReply: async (_conversationId, content) => ({
      conversationId: "c1",
      message: { id: "m2", conversationId: "c1", senderType: "BOT", content, metadata: null, createdAt: new Date() },
      status: "WAITING_USER",
    }),
    handleNonTextEvent: async () => ({
      conversationId: "c1",
      appliedEvent: "INTENT_NOT_RECOGNIZED",
      message: { id: "m3", conversationId: "c1", senderType: "SYSTEM", content: "x", metadata: null, createdAt: new Date() },
      status: "BOT_HANDLING",
    }),
    transferToHuman: async () => ({
      conversationId: "c1",
      status: "WAITING_AGENT",
      ticketId: "t1",
      assignedAgentId: null,
      messageToCustomer: "Te atiende un agente",
    }),
  };
}

function makeIdentity(overrides: Partial<ChatIdentityPort> = {}): ChatIdentityPort {
  return {
    getActiveSessionName: async () => null,
    getActivePrincipal: async () => null,
    startLogin: async () => "https://app.example/login?t=token",
    logout: async () => undefined,
    ...overrides,
  };
}

function makeUseCase(identity?: ChatIdentityPort) {
  return new ProcessIncomingMessageUseCase({
    users: { findOrCreateUser: async () => ({ id: "u1" }) } as UserAccountPort,
    conversations: makeConversations(),
    knowledge: { findAnswer: async () => null },
    transferAfterMisses: 3,
    ...(identity ? { identity } : {}),
  });
}

const inbound = (text: string) => ({ channel: "WEB" as const, contactId: "570000000001", name: "Ana", text });

describe("ProcessIncomingMessageUseCase — identidad del chat", () => {
  it("sin sesión, 'iniciar sesión' responde con el enlace de acceso", async () => {
    const result = await makeUseCase(makeIdentity()).execute(inbound("quiero iniciar sesión"));
    expect(result.handledByBot).toBe(true);
    expect(result.reply).toContain("https://app.example/login?t=token");
  });

  it("con sesión activa, 'mis datos' avisa que ya hay sesión", async () => {
    const result = await makeUseCase(
      makeIdentity({ getActiveSessionName: async () => "Ana" }),
    ).execute(inbound("consultar mis datos"));
    expect(result.reply).toContain("Ana");
    expect(result.reply).toContain("Ya tienes la sesión");
  });

  it("'salir' cierra la sesión y responde sin consultar la base de conocimiento", async () => {
    let loggedOut = false;
    const identity = makeIdentity({
      logout: async () => {
        loggedOut = true;
      },
    });
    const result = await makeUseCase(identity).execute(inbound("salir"));
    expect(loggedOut).toBe(true);
    expect(result.handledByBot).toBe(true);
    expect(result.reply).toContain("cerrado tu sesión");
  });

  it("un mensaje normal sigue el flujo habitual (no lo captura identidad)", async () => {
    const result = await makeUseCase(makeIdentity()).execute(inbound("hola, buenos días"));
    expect(result.reply).not.toContain("login?t=");
  });

  it("sin puerto de identidad, 'iniciar sesión' cae en el flujo normal", async () => {
    const result = await makeUseCase(undefined).execute(inbound("iniciar sesión"));
    expect(result.handledByBot).toBe(false);
    expect(result.reply).not.toContain("login?t=");
  });
});
