import { describe, expect, it } from "vitest";
import { ProcessIncomingMessageUseCase } from "./process-incoming-message.js";
import type {
  ChatIdentityPort,
  InboundConversationPorts,
  UserAccountPort,
} from "./process-incoming-message.js";

// El uso del canal se comprueba con un contacto ya verificado; la puerta de
// verificación se prueba aparte en process-incoming-message.verification.test.ts.
function verifiedIdentity(): ChatIdentityPort {
  return {
    getActiveSessionName: async () => "Ana",
    getActivePrincipal: async () => ({ companyUserId: "u1", displayName: "Ana", role: "USER", companyCustomerId: "CLI-000001" }),
    startLogin: async () => ({ status: "issued" as const, url: "https://app.example/login?t=token" }),
    logout: async () => undefined,
  };
}

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

describe("ProcessIncomingMessageUseCase canal", () => {
  it("usa el canal recibido WEB", async () => {
    let channelUsed: string | undefined;
    const useCase = new ProcessIncomingMessageUseCase({
      users: { findOrCreateUser: async () => ({ id: "u1" }) } as UserAccountPort,
      conversations: {
        ...makePorts(),
        startConversation: async (input) => {
          channelUsed = input.channel;
          return {
            id: "c1",
            userId: input.userId,
            channel: input.channel,
            status: "CLOSED",
            assignedAgentId: null,
            startedAt: new Date(),
            endedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        },
      },
      knowledge: { findAnswer: async () => "ok" },
      identity: verifiedIdentity(),
    });
    await useCase.execute({ channel: "WEB", contactId: "570000000001", name: "Ana", text: "hola" });
    expect(channelUsed).toBe("WEB");
  });

  it("usa el canal recibido WHATSAPP", async () => {
    let channelUsed: string | undefined;
    const useCase = new ProcessIncomingMessageUseCase({
      users: { findOrCreateUser: async () => ({ id: "u1" }) } as UserAccountPort,
      conversations: {
        ...makePorts(),
        startConversation: async (input) => {
          channelUsed = input.channel;
          return {
            id: "c1",
            userId: input.userId,
            channel: input.channel,
            status: "CLOSED",
            assignedAgentId: null,
            startedAt: new Date(),
            endedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        },
      },
      knowledge: { findAnswer: async () => null },
      identity: verifiedIdentity(),
    });
    await useCase.execute({ channel: "WHATSAPP", contactId: "573001234567", name: "Ana", text: "x" });
    expect(channelUsed).toBe("WHATSAPP");
  });
});