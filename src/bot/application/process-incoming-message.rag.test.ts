import { describe, expect, it } from "vitest";
import type { RagEntry, RagMatch, RagService } from "../../modules/rag/rag-service.js";
import type { InboundConversationPorts } from "./process-incoming-message.js";
import { ProcessIncomingMessageUseCase } from "./process-incoming-message.js";

function entry(mode: RagEntry["escalationMode"] = "ninguno", priority = "media"): RagEntry {
  return {
    id: "demo", category: "queja", topic: "demo", intent: "demo", question: "demo",
    variations: [], keywords: [], answer: "Respuesta de orientación.", answerAfterRegistration: null,
    priority, escalationMode: mode, escalationReason: null, requiredData: [], suggestedActions: [],
    confirmationQuestion: "¿Te refieres a la queja demo?", tool: null,
  };
}

function fixture(match: RagMatch | null, id: string) {
  let transfers = 0;
  let findCalls = 0;
  const selected = match?.entry ?? entry();
  const conversations: InboundConversationPorts = {
    startConversation: async (input) => ({
      id, userId: input.userId, channel: input.channel, status: "BOT_HANDLING", assignedAgentId: null,
      startedAt: new Date(), endedAt: null, createdAt: new Date(), updatedAt: new Date(),
    }),
    sendMessage: async () => ({
      conversationId: id,
      message: { id: "m1", conversationId: id, senderType: "USER", content: "consulta", metadata: null, createdAt: new Date() },
      status: "BOT_HANDLING",
    }),
    recordBotReply: async (_conversationId, content) => ({
      conversationId: id,
      message: { id: "m2", conversationId: id, senderType: "BOT", content, metadata: null, createdAt: new Date() },
      status: "WAITING_USER",
    }),
    handleNonTextEvent: async () => ({
      conversationId: id, appliedEvent: "INTENT_NOT_RECOGNIZED",
      message: { id: "m3", conversationId: id, senderType: "SYSTEM", content: "", metadata: null, createdAt: new Date() },
      status: "BOT_HANDLING",
    }),
    transferToHuman: async () => {
      transfers += 1;
      return { conversationId: id, status: "WAITING_AGENT", ticketId: "t", assignedAgentId: null, messageToCustomer: "Asesor" };
    },
  };
  const rag = {
    find: async () => { findCalls += 1; return match; },
    getEntry: () => selected,
  } as unknown as RagService;
  const useCase = new ProcessIncomingMessageUseCase({
    users: { findOrCreateUser: async () => ({ id: "u1" }) }, conversations,
    knowledge: { findAnswer: async () => null }, rag, ragEnabled: true, ragMinScore: 0.55,
    transferAfterMisses: 3,
    identity: {
      getActiveSessionName: async () => null,
      getActivePrincipal: async () => ({ companyUserId: "u1", displayName: "Ana", role: "USER", companyCustomerId: "CLI-123" }),
      startLogin: async () => ({ status: "issued", url: "https://example.invalid/login" }),
      logout: async () => undefined,
    },
  });
  return { useCase, inbound: (text: string) => ({ channel: "WEB" as const, contactId: id, name: "Ana", text }),
    get transfers() { return transfers; }, get findCalls() { return findCalls; } };
}

describe("RAG routing", () => {
  it("responde con modos ninguno/ofrecer sin transferir", async () => {
    for (const mode of ["ninguno", "ofrecer"] as const) {
      const state = fixture({ entry: entry(mode), score: 0.8, secondScore: 0, ambiguous: false }, `contact-${mode}`);
      const result = await state.useCase.execute(state.inbound("consulta"));
      expect(result.reply).toContain("Respuesta de orientación.");
      expect(state.transfers).toBe(0);
      if (mode === "ofrecer") {
        expect(result.reply).toContain("puedo comunicarte con un asesor");
        const accepted = await state.useCase.execute(state.inbound("sí"));
        expect(accepted.status).toBe("WAITING_AGENT");
        expect(state.transfers).toBe(1);
      }
    }
  });

  it("confirma un empate, acepta sí sin repetir la búsqueda y permite descartar con no", async () => {
    const yes = fixture({ entry: entry(), score: 0.8, secondScore: 0.79, ambiguous: true }, "confirm-yes");
    const question = await yes.useCase.execute(yes.inbound("consulta"));
    expect(question.reply).toBe("¿Te refieres a la queja demo?");
    const answer = await yes.useCase.execute(yes.inbound("sí"));
    expect(answer.reply).toContain("Respuesta de orientación.");
    expect(yes.findCalls).toBe(1);

    const no = fixture({ entry: entry(), score: 0.8, secondScore: 0.79, ambiguous: true }, "confirm-no");
    await no.useCase.execute(no.inbound("consulta"));
    await no.useCase.execute(no.inbound("no"));
    expect(no.findCalls).toBe(1);
    expect(no.transfers).toBe(0);
  });

  it("transfiere prioridad crítica aunque el score esté bajo", async () => {
    const state = fixture({ entry: entry("ninguno", "critica"), score: 0.2, secondScore: 0.1, ambiguous: false }, "critical-case");
    const result = await state.useCase.execute(state.inbound("riesgo"));
    expect(state.transfers).toBe(1);
    expect(result.status).toBe("WAITING_AGENT");
  });

  it("pide dos aclaraciones antes de escalar por baja confianza", async () => {
    const state = fixture(null, "low-confidence-case");
    const first = await state.useCase.execute(state.inbound("otra cosa"));
    const second = await state.useCase.execute(state.inbound("sigo sin explicar"));
    expect(first.status).toBe("BOT_HANDLING");
    expect(second.status).toBe("BOT_HANDLING");
    expect(state.transfers).toBe(0);
    const third = await state.useCase.execute(state.inbound("no sé cómo decirlo"));
    expect(third.status).toBe("WAITING_AGENT");
    expect(state.transfers).toBe(1);
  });
});
