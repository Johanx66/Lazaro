import { describe, expect, it, vi } from "vitest";
import { ProcessIncomingMessageUseCase } from "./process-incoming-message.js";
import type {
  ChatIdentityPort,
  DataQueryPort,
  InboundConversationPorts,
  IntentClassifierPort,
  UserAccountPort,
} from "./process-incoming-message.js";

const inbound = (text: string) => ({
  channel: "WEB" as const,
  contactId: "570000000001",
  name: "Ana",
  text,
});

function makeConversations(record: { transferReason?: string } = {}): InboundConversationPorts {
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
    transferToHuman: async (input) => {
      record.transferReason = input.reason;
      return {
        conversationId: "c1",
        status: "WAITING_AGENT",
        ticketId: "t1",
        assignedAgentId: null,
        messageToCustomer: "Te atiende un agente",
      };
    },
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

function makeUseCase(options: {
  conversations: InboundConversationPorts;
  classifier: IntentClassifierPort;
  dataQuery: DataQueryPort;
  identity?: ChatIdentityPort;
  knowledgeAnswer?: string | null;
}) {
  return new ProcessIncomingMessageUseCase({
    users: { findOrCreateUser: async () => ({ id: "u1" }) } satisfies UserAccountPort,
    conversations: options.conversations,
    knowledge: { findAnswer: async () => options.knowledgeAnswer ?? null },
    transferAfterMisses: 3,
    classifier: options.classifier,
    dataQuery: options.dataQuery,
    ...(options.identity ? { identity: options.identity } : {}),
  });
}

describe("ProcessIncomingMessageUseCase — enrutado por clasificador (Fase 5)", () => {
  it("CONSULTA_DATOS sin sesión responde con enlace de login y no consulta datos", async () => {
    const execute = vi.fn().mockResolvedValue({ reply: "no debería usarse" });
    const useCase = makeUseCase({
      conversations: makeConversations(),
      classifier: { classify: async () => ({ intent: "CONSULTA_DATOS" }) },
      dataQuery: { execute },
      identity: makeIdentity(),
    });

    const result = await useCase.execute(inbound("cuál es mi saldo"));

    expect(result.handledByBot).toBe(true);
    expect(result.reply).toContain("https://app.example/login?t=token");
    expect(execute).not.toHaveBeenCalled();
  });

  it("CONSULTA_DATOS con sesión consulta datos usando la identidad de la sesión", async () => {
    const execute = vi.fn().mockResolvedValue({ reply: "Tu saldo es 10" });
    const useCase = makeUseCase({
      conversations: makeConversations(),
      classifier: { classify: async () => ({ intent: "CONSULTA_DATOS" }) },
      dataQuery: { execute },
      identity: makeIdentity({
        getActivePrincipal: async () => ({ companyUserId: "u1", displayName: "Ana", role: "USER" }),
      }),
    });

    const result = await useCase.execute(inbound("cuál es mi saldo"));

    expect(execute).toHaveBeenCalledWith("cuál es mi saldo", { companyUserId: "u1", role: "USER" });
    expect(result.reply).toBe("Tu saldo es 10");
    expect(result.handledByBot).toBe(true);
  });

  it("CONSULTA_DATOS con handoffRequired transfiere a asesor", async () => {
    const record: { transferReason?: string } = {};
    const execute = vi.fn().mockResolvedValue({ reply: "no pude", handoffRequired: true });
    const useCase = makeUseCase({
      conversations: makeConversations(record),
      classifier: { classify: async () => ({ intent: "CONSULTA_DATOS" }) },
      dataQuery: { execute },
      identity: makeIdentity({
        getActivePrincipal: async () => ({ companyUserId: "u1", displayName: "Ana", role: "USER" }),
      }),
    });

    const result = await useCase.execute(inbound("mi saldo"));

    expect(record.transferReason).toBe("LOW_CONFIDENCE");
    expect(result.handledByBot).toBe(false);
  });

  it("PEDIR_HUMANO transfiere a asesor con razón HUMAN_REQUEST", async () => {
    const record: { transferReason?: string } = {};
    const useCase = makeUseCase({
      conversations: makeConversations(record),
      classifier: { classify: async () => ({ intent: "PEDIR_HUMANO" }) },
      dataQuery: { execute: vi.fn() },
    });

    await useCase.execute(inbound("quiero hablar con una persona"));

    expect(record.transferReason).toBe("HUMAN_REQUEST");
  });

  it("si el clasificador falla, transfiere a asesor", async () => {
    const record: { transferReason?: string } = {};
    const useCase = makeUseCase({
      conversations: makeConversations(record),
      classifier: {
        classify: async () => {
          throw new Error("ollama caído");
        },
      },
      dataQuery: { execute: vi.fn() },
    });

    await useCase.execute(inbound("hola"));

    expect(record.transferReason).toBe("LOW_CONFIDENCE");
  });

  it("FAQ responde desde la base de conocimiento", async () => {
    const useCase = makeUseCase({
      conversations: makeConversations(),
      classifier: { classify: async () => ({ intent: "FAQ" }) },
      dataQuery: { execute: vi.fn() },
      knowledgeAnswer: "Abrimos de 9 a 18",
    });

    const result = await useCase.execute(inbound("cuál es el horario"));

    expect(result.handledByBot).toBe(true);
    expect(result.reply).toBe("Abrimos de 9 a 18");
  });
});
