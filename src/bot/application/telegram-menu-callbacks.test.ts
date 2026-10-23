import { describe, expect, it, vi } from "vitest";
import type { Conversation, ConversationStatus } from "../../modules/conversations/domain/entities/conversation.js";
import type { RagEntry } from "../../modules/rag/rag-service.js";
import type { InboundConversationPorts } from "./process-incoming-message.js";
import { ProcessIncomingMessageUseCase } from "./process-incoming-message.js";

function conversation(status: ConversationStatus = "BOT_HANDLING"): Conversation {
  const now = new Date();
  return { id: "c1", userId: "u1", channel: "TELEGRAM", status, assignedAgentId: null, startedAt: now, endedAt: null, createdAt: now, updatedAt: now };
}

function ports(status: ConversationStatus = "BOT_HANDLING"): InboundConversationPorts {
  return {
    startConversation: async () => conversation(status),
    sendMessage: async ({ content }) => ({ conversationId: "c1", message: { id: "m1", conversationId: "c1", senderType: "USER", content, metadata: null, createdAt: new Date() }, status }),
    recordBotReply: async (_id, content) => ({ conversationId: "c1", message: { id: "m2", conversationId: "c1", senderType: "BOT", content, metadata: null, createdAt: new Date() }, status: "WAITING_USER" }),
    handleNonTextEvent: async () => { throw new Error("no usado"); },
    transferToHuman: async () => ({ conversationId: "c1", status: "WAITING_AGENT", ticketId: "t1" } as never),
  };
}

const identity = {
  getActiveSessionName: async () => "Ana",
  getActivePrincipal: async () => ({ companyUserId: "u1", displayName: "Ana", role: "USER" as const, companyCustomerId: "USR_101" }),
  startLogin: async () => ({ status: "issued" as const, url: "https://example.test/login" }),
  logout: async () => undefined,
};

function knowledgeEntry(overrides: Partial<RagEntry> = {}): RagEntry {
  return {
    id: "pedido.info", category: "PQRS peticion", topic: "pedido", intent: "info", question: "¿Cómo consulto mi pedido?", variations: [], keywords: [],
    answer: "Consulta {{url_condiciones}}.", answerAfterRegistration: null, priority: "baja", escalationMode: "ninguno", escalationReason: null,
    requiredData: [], suggestedActions: [], confirmationQuestion: null, tool: null, ...overrides,
  };
}

function useCase(overrides: Record<string, unknown> = {}) {
  return new ProcessIncomingMessageUseCase({
    users: { findOrCreateUser: async () => ({ id: "u1" }) }, conversations: ports(),
    knowledge: { findAnswer: vi.fn(async () => null) }, identity, transferAfterMisses: 3,
    listPqrsMenuEntries: async () => [{ id: "pedido.info", topic: "pedido", question: "¿Cómo consulto mi pedido?", tool: null }],
    getPqrsMenuEntry: async () => knowledgeEntry(), ...overrides,
  } as never);
}

describe("callbacks del menú Telegram", () => {
  it("rechaza callbacks desconocidos y no los entrega al RAG ni al FAQ", async () => {
    const findAnswer = vi.fn(async () => null);
    const ragFind = vi.fn(async () => null);
    const processor = useCase({ knowledge: { findAnswer }, rag: { find: ragFind } });
    const result = await processor.execute({ channel: "TELEGRAM", contactId: "tg1", name: "Ana", text: "pqrs:whatever:private" });
    expect(result.reply).toContain("Ese botón ya no está disponible");
    expect(findAnswer).not.toHaveBeenCalled();
    expect(ragFind).not.toHaveBeenCalled();
  });

  it("una selección de pregunta obtiene la entrada y reemplaza placeholders", async () => {
    const get = vi.fn(async () => knowledgeEntry());
    const processor = useCase({ getPqrsMenuEntry: get, menuPlaceholders: { companyName: "Empresa", officialChannel: "canal", conditionsUrl: "https://example.test/condiciones" } });
    const result = await processor.execute({ channel: "TELEGRAM", contactId: "tg1", name: "Ana", text: "pqrs:entry:pedido.info" });
    expect(get).toHaveBeenCalledWith("pedido.info");
    expect(result.reply).toContain("https://example.test/condiciones");
    expect(result.reply).not.toMatch(/\{\{[^}]+\}\}/u);
  });

  it.each([
    ["ninguno", "baja", false], ["ofrecer", "baja", false], ["inmediato", "baja", true], ["ninguno", "critica", true],
  ] as const)("respeta escalationMode %s y prioridad %s", async (mode, priority, expectedTransfer) => {
    const transferToHuman = vi.fn(async () => ({ conversationId: "c1", status: "WAITING_AGENT", ticketId: "t1" } as never));
    const conversationPorts = { ...ports(), transferToHuman };
    const processor = useCase({ conversations: conversationPorts, getPqrsMenuEntry: async () => knowledgeEntry({ escalationMode: mode, priority }) });
    const result = await processor.execute({ channel: "TELEGRAM", contactId: "tg1", name: "Ana", text: "pqrs:entry:pedido.info" });
    expect(result.reply?.includes("Si quieres, puedo comunicarte con un asesor.")).toBe(mode === "ofrecer" && priority !== "critica");
    expect(transferToHuman).toHaveBeenCalledTimes(expectedTransfer ? 1 : 0);
  });

  it("redirige entradas de herramienta a botones de datos", async () => {
    const processor = useCase({ getPqrsMenuEntry: async () => knowledgeEntry({ tool: "consulta_saldo" }) });
    const result = await processor.execute({ channel: "TELEGRAM", contactId: "tg1", name: "Ana", text: "pqrs:entry:pedido.info" });
    expect(result.menu?.buttons.flat().map(({ callbackData }) => callbackData)).toContain("data:balance");
    expect(result.reply).not.toContain("Consulta {{");
  });

  it("recorre área, tema y página siguiente sin salir al flujo RAG", async () => {
    const list = Array.from({ length: 8 }, (_, index) => ({ id: `pedido.item_${index}`, topic: "pedido", question: `Pregunta ${index}`, tool: null }));
    const processor = useCase({ listPqrsMenuEntries: async () => list });
    const area = await processor.execute({ channel: "TELEGRAM", contactId: "tg1", name: "Ana", text: "menu:area:pedidos" });
    expect(area.menu?.buttons.flat().some(({ callbackData }) => callbackData === "pqrs:topic:pedido")).toBe(true);
    const topic = await processor.execute({ channel: "TELEGRAM", contactId: "tg1", name: "Ana", text: "pqrs:topic:pedido" });
    expect(topic.menu?.buttons.flat().filter(({ callbackData }) => callbackData.startsWith("pqrs:entry:")).length).toBe(6);
    expect(topic.menu?.buttons.flat().some(({ callbackData }) => callbackData === "pqrs:page:pedido:1")).toBe(true);
    const next = await processor.execute({ channel: "TELEGRAM", contactId: "tg1", name: "Ana", text: "pqrs:page:pedido:1" });
    expect(next.menu?.buttons.flat().filter(({ callbackData }) => callbackData.startsWith("pqrs:entry:")).length).toBe(2);
    expect(next.menu?.buttons.flat().some(({ callbackData }) => callbackData === "pqrs:page:pedido:0")).toBe(true);
  });

  it("Mis datos ejecuta la herramienta fija sin selector y usa el cliente de sesión", async () => {
    const execute = vi.fn(async () => ({ reply: "Tu saldo es $10.00." }));
    const executeTool = vi.fn(async (_name: string, session: { companyCustomerId: string | null }) => {
      expect(session.companyCustomerId).toBe("USR_101");
      return { reply: "Tu saldo es $10.00." };
    });
    const processor = useCase({ dataQuery: { execute, executeTool } });
    const result = await processor.execute({ channel: "TELEGRAM", contactId: "tg1", name: "Ana", text: "data:balance" });
    expect(result.reply).toBe("Tu saldo es $10.00.");
    expect(executeTool).toHaveBeenCalledWith("get_customer_balance", expect.any(Object));
    expect(execute).not.toHaveBeenCalled();
  });

  it("sin sesión conserva el envío de enlace de acceso y no ejecuta datos", async () => {
    const executeTool = vi.fn();
    const processor = useCase({ identity: { ...identity, getActivePrincipal: async () => null }, dataQuery: { execute: vi.fn(), executeTool } });
    const result = await processor.execute({ channel: "TELEGRAM", contactId: "tg1", name: "Ana", text: "data:orders" });
    expect(result.reply).toContain("Verifica tu identidad");
    expect(executeTool).not.toHaveBeenCalled();
  });

  it.each(["WEB", "WHATSAPP"] as const)("%s conserva respuesta de texto y no añade teclado de Telegram", async (channel) => {
    const processor = useCase();
    const result = await processor.execute({ channel, contactId: "customer", name: "Ana", text: "menú" });
    expect(result.reply).toContain("Elige una opción");
    expect(result.menu).toBeUndefined();
  });
});
