import { describe, expect, it, vi } from "vitest";
import type { Conversation, ConversationStatus } from "../../modules/conversations/domain/entities/conversation.js";
import type { RagEntry, RagService } from "../../modules/rag/rag-service.js";
import type { InboundConversationPorts } from "./process-incoming-message.js";
import { ProcessIncomingMessageUseCase } from "./process-incoming-message.js";

function makeConversation(status: ConversationStatus): Conversation {
  const now = new Date();
  return {
    id: "conversation-1", userId: "user-1", channel: "TELEGRAM", status,
    assignedAgentId: null, startedAt: now, endedAt: null, createdAt: now, updatedAt: now,
  };
}

const identity = {
  getActiveSessionName: async () => "Ana",
  getActivePrincipal: async () => ({ companyUserId: "user-1", displayName: "Ana", role: "USER" as const, companyCustomerId: "CLI-000123" }),
  startLogin: async () => ({ status: "reused" as const }),
  logout: async () => undefined,
};

describe("regresiones observadas en producción", () => {
  it("procesa handoff:back aunque la conversación espera y ya no haya ticket activo", async () => {
    const cancel = vi.fn(async () => undefined);
    const conversations: InboundConversationPorts = {
      startConversation: async () => makeConversation("WAITING_AGENT"),
      sendMessage: async () => ({ conversationId: "conversation-1", message: { id: "m1", conversationId: "conversation-1", senderType: "USER", content: "Volver al menú", metadata: null, createdAt: new Date() }, status: "WAITING_AGENT" }),
      recordBotReply: async (_id, content) => ({ conversationId: "conversation-1", message: { id: "m2", conversationId: "conversation-1", senderType: "BOT", content, metadata: null, createdAt: new Date() }, status: "WAITING_USER" }),
      handleNonTextEvent: async () => { throw new Error("not used"); },
      transferToHuman: async () => { throw new Error("not used"); },
      handoff: {
        findActiveTicketCreatedAt: async () => null,
        hasAgentMessage: async () => false,
        hasReminder: async () => false,
        sendReminder: async () => undefined,
        cancel,
      },
    };
    const useCase = new ProcessIncomingMessageUseCase({
      users: { findOrCreateUser: async () => ({ id: "user-1" }) }, conversations,
      knowledge: { findAnswer: async () => null }, transferAfterMisses: 3, identity,
    });

    const result = await useCase.execute({ channel: "TELEGRAM", contactId: "telegram-1", name: "Ana", text: "handoff:back" });

    expect(cancel).toHaveBeenCalledOnce();
    expect(result.reply).toContain("Elige una opción");
    expect(result.status).toBe("WAITING_USER");
  });

  it("devuelve al bot y responde mensajes normales si ya no hay ticket activo", async () => {
    const cancel = vi.fn(async () => undefined);
    const conversations: InboundConversationPorts = {
      startConversation: async () => makeConversation("OPEN"),
      sendMessage: async () => ({ conversationId: "conversation-1", message: { id: "m1", conversationId: "conversation-1", senderType: "USER", content: "consulta general", metadata: null, createdAt: new Date() }, status: "OPEN" }),
      recordBotReply: async (_id, content) => ({ conversationId: "conversation-1", message: { id: "m2", conversationId: "conversation-1", senderType: "BOT", content, metadata: null, createdAt: new Date() }, status: "WAITING_USER" }),
      handleNonTextEvent: async () => { throw new Error("not used"); },
      transferToHuman: async () => { throw new Error("not used"); },
      handoff: {
        findActiveTicketCreatedAt: async () => null,
        hasAgentMessage: async () => false,
        hasReminder: async () => false,
        sendReminder: async () => undefined,
        cancel,
      },
    };
    const useCase = new ProcessIncomingMessageUseCase({
      users: { findOrCreateUser: async () => ({ id: "user-1" }) }, conversations,
      knowledge: { findAnswer: async () => "Respuesta recuperada por el bot." },
      transferAfterMisses: 3, identity,
    });

    const result = await useCase.execute({ channel: "TELEGRAM", contactId: "telegram-1", name: "Ana", text: "consulta general" });

    expect(cancel).toHaveBeenCalledOnce();
    expect(result.reply).toBe("Respuesta recuperada por el bot.");
    expect(result.status).toBe("WAITING_USER");
  });

  it("responde con orientación de una entrada de saldo cuando Pieza 2 no está configurada", async () => {
    const entry: RagEntry = {
      id: "general.consultar_saldo", category: "general", topic: "saldo", intent: "consultar_saldo",
      question: "¿Cuál es mi saldo?", variations: [], keywords: ["saldo"],
      answer: "Puedo consultar tu saldo si iniciaste sesión con tu cuenta de cliente.",
      answerAfterRegistration: null, priority: "baja", escalationMode: "ninguno", escalationReason: null,
      requiredData: [], suggestedActions: [], confirmationQuestion: null, tool: "consulta_saldo",
    };
    const conversations: InboundConversationPorts = {
      startConversation: async () => makeConversation("BOT_HANDLING"),
      sendMessage: async () => ({ conversationId: "conversation-1", message: { id: "m1", conversationId: "conversation-1", senderType: "USER", content: "¿Cómo hago mis pagos?", metadata: null, createdAt: new Date() }, status: "BOT_HANDLING" }),
      recordBotReply: async (_id, content) => ({ conversationId: "conversation-1", message: { id: "m2", conversationId: "conversation-1", senderType: "BOT", content, metadata: null, createdAt: new Date() }, status: "WAITING_USER" }),
      handleNonTextEvent: async () => { throw new Error("not used"); },
      transferToHuman: async () => { throw new Error("not used"); },
    };
    const rag = {
      find: async () => ({ entry, score: 0.82, secondScore: 0.31, ambiguous: false }),
      getEntry: () => entry,
    } as unknown as RagService;
    const useCase = new ProcessIncomingMessageUseCase({
      users: { findOrCreateUser: async () => ({ id: "user-1" }) }, conversations,
      knowledge: { findAnswer: async () => null }, rag, ragEnabled: true, ragMinScore: 0.55,
      transferAfterMisses: 3, identity,
    });

    const result = await useCase.execute({ channel: "TELEGRAM", contactId: "telegram-1", name: "Ana", text: "¿Cómo hago mis pagos?" });

    expect(result.reply).toContain(entry.answer);
  });
});
