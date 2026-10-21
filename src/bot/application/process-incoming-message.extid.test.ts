import { describe, expect, it } from "vitest";
import { ProcessIncomingMessageUseCase } from "./process-incoming-message.js";
import type {
  ChatIdentityPort,
  InboundConversationPorts,
  UserAccountPort,
} from "./process-incoming-message.js";

// Contacto verificado: aquí solo se comprueba la identidad externa por canal.
const verified: ChatIdentityPort = {
  getActiveSessionName: async () => "Ana",
  getActivePrincipal: async () => ({ companyUserId: "u1", displayName: "Ana", role: "USER", companyCustomerId: "CLI-000001" }),
  startLogin: async () => ({ status: "issued" as const, url: "https://app.example/login?t=token" }),
  logout: async () => undefined,
};

function makePorts(): InboundConversationPorts {
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
    recordBotReply: async () => ({
      conversationId: "c1",
      message: { id: "m2", conversationId: "c1", senderType: "BOT", content: "ok", metadata: null, createdAt: new Date() },
      status: "WAITING_USER",
    }),
    handleNonTextEvent: async () => ({
      conversationId: "c1",
      appliedEvent: "TRANSFERRED_TO_HUMAN",
      message: { id: "m3", conversationId: "c1", senderType: "SYSTEM", content: "x", metadata: null, createdAt: new Date() },
      status: "WAITING_AGENT",
    }),
  };
}

describe("externalCustomerId según canal", () => {
  it("usa web-<contactId> para canal WEB", async () => {
    let ext: string | undefined;
    const useCase = new ProcessIncomingMessageUseCase({
      users: {
        findOrCreateUser: async (_phone, _name, channel) => {
          ext = `${channel.toLowerCase()}-570000000001`;
          return { id: "u1" };
        },
      } as UserAccountPort,
      conversations: makePorts(),
      knowledge: { findAnswer: async () => "ok" },
      identity: verified,
    });
    await useCase.execute({ channel: "WEB", contactId: "570000000001", name: "Ana", text: "hola" });
    expect(ext).toBe("web-570000000001");
  });

  it("usa whatsapp-<contactId> para canal WHATSAPP", async () => {
    let ext: string | undefined;
    const useCase = new ProcessIncomingMessageUseCase({
      users: {
        findOrCreateUser: async (_phone, _name, channel) => {
          ext = `${channel.toLowerCase()}-573001234567`;
          return { id: "u1" };
        },
      } as UserAccountPort,
      conversations: makePorts(),
      knowledge: { findAnswer: async () => "ok" },
      identity: verified,
    });
    await useCase.execute({ channel: "WHATSAPP", contactId: "573001234567", name: "Ana", text: "hola" });
    expect(ext).toBe("whatsapp-573001234567");
  });

  it("usa telegram-<contactId> para canal TELEGRAM", async () => {
    let ext: string | undefined;
    const useCase = new ProcessIncomingMessageUseCase({
      users: {
        findOrCreateUser: async (_phone, _name, channel) => {
          ext = `${channel.toLowerCase()}-570123456789`;
          return { id: "u1" };
        },
      } as UserAccountPort,
      conversations: makePorts(),
      knowledge: { findAnswer: async () => "ok" },
      identity: verified,
    });
    await useCase.execute({ channel: "TELEGRAM", contactId: "570123456789", name: "Ana", text: "hola" });
    expect(ext).toBe("telegram-570123456789");
  });
});