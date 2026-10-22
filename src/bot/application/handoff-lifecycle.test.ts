import { describe, expect, it, vi } from "vitest";
import { ProcessIncomingMessageUseCase } from "./process-incoming-message.js";
import type { Conversation, ConversationStatus, Message } from "../../modules/conversations/domain/entities/conversation.js";
import type { InboundConversationPorts } from "./process-incoming-message.js";

const waitMessage = "⏳ Ya te conectamos con un asesor 👨‍💼. También puedes volver al menú 🔙";
const reminder = "⏳ Seguimos buscando a un asesor. Escribe «menú» o pulsa 🔙 Volver al menú para elegir otra opción.";

function setup(initialStatus: ConversationStatus, ticketCreatedAt = new Date(), agentHasReplied = false) {
  const conversation: Conversation = {
    id: "conversation-1", userId: "user-1", channel: "WEB", status: initialStatus,
    assignedAgentId: initialStatus === "OPEN" ? "agent-1" : null,
    startedAt: new Date(), endedAt: null, createdAt: new Date(), updatedAt: new Date(),
  };
  let activeTicket = true;
  let reminderSent = false;
  const transfer = vi.fn(async () => ({
    conversationId: conversation.id, ticketId: "ticket-1", assignedAgentId: null,
    status: "WAITING_AGENT" as const, messageToCustomer: "mensaje interno de transferencia",
  }));
  const cancel = vi.fn(async () => { activeTicket = false; conversation.status = "BOT_HANDLING"; conversation.assignedAgentId = null; });
  const ports: InboundConversationPorts = {
    startConversation: async () => conversation,
    sendMessage: async () => ({
      conversationId: conversation.id,
      message: { id: "user-message", conversationId: conversation.id, senderType: "USER", content: "hola", metadata: null, createdAt: new Date() } as Message,
      status: conversation.status,
    }),
    recordBotReply: async (_id, content) => {
      conversation.status = "WAITING_USER";
      return {
        conversationId: conversation.id,
        message: { id: "bot-message", conversationId: conversation.id, senderType: "BOT", content, metadata: null, createdAt: new Date() } as Message,
        status: conversation.status,
      };
    },
    handleNonTextEvent: async () => ({ conversationId: conversation.id, status: conversation.status, reply: null }),
    transferToHuman: transfer,
    handoff: {
      findActiveTicketCreatedAt: async () => activeTicket ? ticketCreatedAt : null,
      hasAgentMessage: async () => agentHasReplied,
      hasReminder: async () => reminderSent,
      sendReminder: async () => { reminderSent = true; },
      cancel,
    },
  };
  const useCase = new ProcessIncomingMessageUseCase({
    users: { findOrCreateUser: async () => ({ id: "user-1" }) },
    conversations: ports,
    knowledge: { findAnswer: async () => "respuesta" },
    transferAfterMisses: 3,
    handoffWaitMessage: waitMessage,
    handoffTimeoutMinutes: 15,
    identity: {
      getActiveSessionName: async () => "Ana",
      getActivePrincipal: async () => ({ companyUserId: "user-1", displayName: "Ana", role: "USER", companyCustomerId: "CLI-000001" }),
      startLogin: async () => ({ status: "issued" as const, url: "https://example.invalid/login" }),
      logout: async () => undefined,
    },
  });
  return { conversation, transfer, useCase, cancel };
}

const input = (text: string) => ({ channel: "WEB" as const, contactId: "570000000001", name: "Ana", text });

describe("ciclo de transferencia a asesor", () => {
  it("envía el mensaje de espera configurable al transferir", async () => {
    const { useCase, transfer } = setup("BOT_HANDLING");
    const result = await useCase.execute(input("hablar con un agente"));
    expect(transfer).toHaveBeenCalledOnce();
    expect(result.reply).toBe(waitMessage);
    expect(result.status).toBe("WAITING_AGENT");
  });

  it("volver al menú cancela la transferencia y muestra el menú", async () => {
    const { conversation, useCase } = setup("WAITING_AGENT");
    const result = await useCase.execute(input("volver"));
    expect(conversation.status).toBe("WAITING_USER");
    expect(result.reply).toContain("Sesión verificada. Elige una opción:");
    expect(result.status).toBe("WAITING_USER");
  });

  it("repetir mensajes durante la espera solo recuerda volver, sin duplicar transferencia", async () => {
    const { transfer, useCase } = setup("WAITING_AGENT");
    const first = await useCase.execute(input("¿hay novedades?"));
    const second = await useCase.execute(input("sigo esperando"));
    expect(first.reply).toBe(reminder);
    expect(second.reply).toBeNull();
    expect(transfer).not.toHaveBeenCalled();
  });

  it("al vencer el tiempo máximo retoma el bot y ofrece el menú", async () => {
    const started = new Date(Date.now() - 16 * 60_000);
    const { conversation, useCase } = setup("OPEN", started);
    const result = await useCase.execute(input("hola de nuevo"));
    expect(conversation.status).toBe("WAITING_USER");
    expect(result.reply).toContain("El tiempo de espera con el asesor terminó");
    expect(result.reply).toContain("Sesión verificada. Elige una opción:");
  });

  it("no aplica el vencimiento si el asesor ya respondió", async () => {
    const started = new Date(Date.now() - 16 * 60_000);
    const { conversation, useCase, cancel } = setup("OPEN", started, true);
    const result = await useCase.execute(input("hola de nuevo"));
    expect(cancel).not.toHaveBeenCalled();
    expect(conversation.status).toBe("OPEN");
    expect(result.reply).toBeNull();
    expect(result.status).toBe("OPEN");
  });
});

