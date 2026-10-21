import { describe, expect, it, vi } from "vitest";
import { ProcessIncomingMessageUseCase } from "./process-incoming-message.js";
import type { InboundConversationPorts, UserAccountPort } from "./process-incoming-message.js";
import { transition } from "../../modules/conversations/domain/state-machine.js";
import type {
  Conversation,
  ConversationStatus,
  Message,
} from "../../modules/conversations/domain/entities/conversation.js";

function makeMessage(
  conversationId: string,
  senderType: Message["senderType"],
  content: string,
): Message {
  return {
    id: `m-${senderType}-${content}`,
    conversationId,
    senderType,
    content,
    metadata: null,
    createdAt: new Date(),
  };
}

function setup(initialStatus: ConversationStatus) {
  const conversation: Conversation = {
    id: "c1",
    userId: "u1",
    channel: "WEB",
    status: initialStatus,
    assignedAgentId: initialStatus === "OPEN" ? "a1" : null,
    startedAt: new Date(),
    endedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const savedContents: string[] = [];

  const transferSpy = vi.fn(async () => {
    const next = transition(
      { status: conversation.status, assignedAgentId: conversation.assignedAgentId },
      { type: "TRANSFERRED_TO_HUMAN" },
    );
    conversation.status = next.status;
    return {
      conversationId: conversation.id,
      appliedEvent: "TRANSFERRED_TO_HUMAN" as const,
      message: makeMessage(conversation.id, "SYSTEM", "transfiere"),
      status: next.status,
    };
  });

  const ports: InboundConversationPorts = {
    startConversation: async () => conversation,
    sendMessage: async (input) => {
      savedContents.push(input.content);
      const next = transition(
        { status: conversation.status, assignedAgentId: conversation.assignedAgentId },
        { type: "MESSAGE_RECEIVED" },
      );
      conversation.status = next.status;
      return {
        conversationId: conversation.id,
        message: makeMessage(conversation.id, "USER", input.content),
        status: next.status,
      };
    },
    recordBotReply: async (_id, content) => {
      const next = transition(
        { status: conversation.status, assignedAgentId: conversation.assignedAgentId },
        { type: "BOT_RESPONSE" },
      );
      conversation.status = next.status;
      return {
        conversationId: conversation.id,
        message: makeMessage(conversation.id, "BOT", content),
        status: next.status,
      };
    },
    handleNonTextEvent: transferSpy,
  };

  const findAnswer = vi.fn(async () => "respuesta del bot");

  const useCase = new ProcessIncomingMessageUseCase({
    users: { findOrCreateUser: async () => ({ id: "u1" }) } as UserAccountPort,
    conversations: ports,
    knowledge: { findAnswer },
    // Contacto verificado: la puerta de verificación se prueba en su propio test.
    identity: {
      getActiveSessionName: async () => "Ana",
      getActivePrincipal: async () => ({ companyUserId: "u1", displayName: "Ana", role: "USER" }),
      startLogin: async () => ({ status: "issued" as const, url: "https://app.example/login?t=token" }),
      logout: async () => undefined,
    },
  });

  return { conversation, savedContents, transferSpy, findAnswer, useCase };
}

const inbound = {
  channel: "WEB" as const,
  contactId: "570000000001",
  name: "Ana",
  text: "hola",
};

describe("ProcessIncomingMessageUseCase — el bot solo responde en BOT_HANDLING", () => {
  it("cliente en WAITING_AGENT: guarda el mensaje y el bot no responde ni cambia el estado", async () => {
    const { conversation, savedContents, transferSpy, findAnswer, useCase } = setup("WAITING_AGENT");

    const result = await useCase.execute(inbound);

    expect(result).toEqual({
      conversationId: "c1",
      reply: null,
      handledByBot: false,
      status: "WAITING_AGENT",
    });
    expect(conversation.status).toBe("WAITING_AGENT");
    expect(savedContents).toEqual(["hola"]);
    expect(findAnswer).not.toHaveBeenCalled();
    expect(transferSpy).not.toHaveBeenCalled();
  });

  it("cliente en OPEN (asesor asignado): guarda el mensaje y el bot no responde", async () => {
    const { conversation, savedContents, transferSpy, findAnswer, useCase } = setup("OPEN");

    const result = await useCase.execute(inbound);

    expect(result).toEqual({
      conversationId: "c1",
      reply: null,
      handledByBot: false,
      status: "OPEN",
    });
    expect(conversation.status).toBe("OPEN");
    expect(savedContents).toEqual(["hola"]);
    expect(findAnswer).not.toHaveBeenCalled();
    expect(transferSpy).not.toHaveBeenCalled();
  });

  it("tras RETURNED_TO_BOT el bot vuelve a responder", async () => {
    const { conversation, useCase } = setup("WAITING_AGENT");

    const returned = transition(
      { status: conversation.status, assignedAgentId: conversation.assignedAgentId },
      { type: "RETURNED_TO_BOT" },
    );
    conversation.status = returned.status;
    expect(conversation.status).toBe("BOT_HANDLING");

    const result = await useCase.execute(inbound);

    expect(result).toMatchObject({
      reply: "respuesta del bot",
      handledByBot: true,
      status: "WAITING_USER",
    });
  });
});
