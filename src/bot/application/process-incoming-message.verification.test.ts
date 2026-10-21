import { describe, expect, it, vi } from "vitest";
import {
  ProcessIncomingMessageUseCase,
  UNVERIFIED_REPLY,
} from "./process-incoming-message.js";
import type {
  ChatChannel,
  ChatIdentityPort,
  DataQueryPort,
  InboundConversationPorts,
  IntentClassifierPort,
  UserAccountPort,
} from "./process-incoming-message.js";

const CHANNELS: ChatChannel[] = ["WEB", "WHATSAPP", "TELEGRAM"];

// Mensajes que NO deben saltarse la verificación: preguntas, quejas, reclamos,
// peticiones, PQRS, sugerencias y la petición de hablar con una persona.
const BLOCKED_TEXTS = [
  "hola",
  "¿cuál es mi saldo?",
  "tengo una queja sobre el servicio",
  "quiero poner un reclamo",
  "esta es una petición formal",
  "presento una PQRS",
  "tengo una sugerencia",
  "quiero hablar con una persona",
  "necesito un asesor humano",
  "cuál es el horario de atención",
];

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

interface Spies {
  classify: ReturnType<typeof vi.fn>;
  dataQueryExecute: ReturnType<typeof vi.fn>;
  findAnswer: ReturnType<typeof vi.fn>;
  startLogin: ReturnType<typeof vi.fn>;
  getActivePrincipal: ReturnType<typeof vi.fn>;
}

function makeUseCase(options: {
  getActivePrincipal: () => Promise<{ companyUserId: string; displayName: string; role: "USER" } | null>;
  identity?: boolean;
} ): { useCase: ProcessIncomingMessageUseCase; spies: Spies } {
  const classify = vi.fn(async () => ({ intent: "FAQ" as const }));
  const dataQueryExecute = vi.fn(async () => ({ reply: "datos" }));
  const findAnswer = vi.fn(async () => null);
  const startLogin = vi.fn(async () => ({ status: "issued" as const, url: "https://app.example/login?t=token-unico" }));
  const getActivePrincipal = vi.fn(options.getActivePrincipal);

  const classifier: IntentClassifierPort = { classify };
  const dataQuery: DataQueryPort = { execute: dataQueryExecute };
  const users: UserAccountPort = { findOrCreateUser: async () => ({ id: "u1" }) };

  const identity: ChatIdentityPort = {
    getActiveSessionName: async () => "Ana",
    getActivePrincipal,
    startLogin,
    logout: async () => undefined,
  };

  const useCase = new ProcessIncomingMessageUseCase({
    users,
    conversations: makeConversations(),
    knowledge: { findAnswer },
    transferAfterMisses: 3,
    classifier,
    dataQuery,
    ...(options.identity === false ? {} : { identity }),
  });

  return { useCase, spies: { classify, dataQueryExecute, findAnswer, startLogin, getActivePrincipal } };
}

describe("ProcessIncomingMessageUseCase — puerta de verificación obligatoria", () => {
  it("contacto sin sesión recibe el mensaje estático y el enlace, sin llamar a la IA", async () => {
    const { useCase, spies } = makeUseCase({ getActivePrincipal: async () => null });

    const result = await useCase.execute({
      channel: "WEB",
      contactId: "570000000001",
      name: "Ana",
      text: "¿cuál es mi saldo?",
    });

    expect(result.handledByBot).toBe(false);
    expect(result.reply).toContain(UNVERIFIED_REPLY);
    expect(result.reply).toContain("https://app.example/login?t=token-unico");

    expect(spies.getActivePrincipal).toHaveBeenCalledWith("WEB", "570000000001");
    expect(spies.startLogin).toHaveBeenCalledWith("WEB", "570000000001");
    expect(spies.classify).not.toHaveBeenCalled();
    expect(spies.dataQueryExecute).not.toHaveBeenCalled();
    expect(spies.findAnswer).not.toHaveBeenCalled();
  });

  for (const channel of CHANNELS) {
    it(`bloquea todo mensaje sin sesión en el canal ${channel}`, async () => {
      const { useCase, spies } = makeUseCase({ getActivePrincipal: async () => null });

      for (const text of BLOCKED_TEXTS) {
        const result = await useCase.execute({
          channel,
          contactId: "570000000001",
          name: "Ana",
          text,
        });
        expect(result.handledByBot).toBe(false);
        expect(result.reply).toContain(UNVERIFIED_REPLY);
      }

      expect(spies.classify).not.toHaveBeenCalled();
      expect(spies.dataQueryExecute).not.toHaveBeenCalled();
      expect(spies.findAnswer).not.toHaveBeenCalled();
    });
  }

  it("con sesión vigente el flujo NO se bloquea y el clasificador sí se ejecuta", async () => {
    const { useCase, spies } = makeUseCase({
      getActivePrincipal: async () => ({ companyUserId: "u1", displayName: "Ana", role: "USER" }),
    });

    const result = await useCase.execute({
      channel: "WEB",
      contactId: "570000000001",
      name: "Ana",
      text: "¿cuál es el horario?",
    });

    expect(spies.getActivePrincipal).toHaveBeenCalledTimes(1);
    expect(spies.startLogin).not.toHaveBeenCalled();
    expect(spies.classify).toHaveBeenCalledTimes(1);
    expect(result.reply).not.toContain(UNVERIFIED_REPLY);
  });

  it("sin puerto de identidad se deniega por defecto (fail closed) y no se llama a la IA", async () => {
    const { useCase, spies } = makeUseCase({
      getActivePrincipal: async () => null,
      identity: false,
    });

    const result = await useCase.execute({
      channel: "WHATSAPP",
      contactId: "573001234567",
      name: "Ana",
      text: "hola",
    });

    expect(result.handledByBot).toBe(false);
    expect(result.reply).toContain(UNVERIFIED_REPLY);
    expect(spies.classify).not.toHaveBeenCalled();
    expect(spies.dataQueryExecute).not.toHaveBeenCalled();
    expect(spies.findAnswer).not.toHaveBeenCalled();
  });

  it("'salir' sin sesión responde un mensaje estático sin enlace y sin IA", async () => {
    const { useCase, spies } = makeUseCase({ getActivePrincipal: async () => null });

    const result = await useCase.execute({
      channel: "TELEGRAM",
      contactId: "570123456789",
      name: "Ana",
      text: "salir",
    });

    expect(result.handledByBot).toBe(false);
    expect(result.reply).toContain("No tienes una sesión activa");
    expect(result.reply).not.toContain(UNVERIFIED_REPLY);
    expect(spies.startLogin).not.toHaveBeenCalled();
    expect(spies.classify).not.toHaveBeenCalled();
    expect(spies.findAnswer).not.toHaveBeenCalled();
  });

  it("si el enlace ya fue entregado se reutiliza: no se envía una URL nueva", async () => {
    const { useCase, spies } = makeUseCase({ getActivePrincipal: async () => null });
    spies.startLogin.mockResolvedValueOnce({ status: "reused" });

    const result = await useCase.execute({
      channel: "WEB",
      contactId: "570000000001",
      name: "Ana",
      text: "hola otra vez",
    });

    expect(result.handledByBot).toBe(false);
    expect(result.reply).toContain(UNVERIFIED_REPLY);
    expect(result.reply).toContain("Ya te enviamos un enlace de acceso");
    expect(result.reply).not.toContain("login?t=");
    expect(spies.classify).not.toHaveBeenCalled();
    expect(spies.findAnswer).not.toHaveBeenCalled();
  });

  it("no persiste el token del enlace en el historial de la conversación", async () => {    const persisted: string[] = [];
    const conversations = makeConversations();
    conversations.recordBotReply = async (_conversationId, content) => {
      persisted.push(content);
      return {
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
      };
    };

    const useCase = new ProcessIncomingMessageUseCase({
      users: { findOrCreateUser: async () => ({ id: "u1" }) },
      conversations,
      knowledge: { findAnswer: async () => null },
      transferAfterMisses: 3,
      identity: {
        getActiveSessionName: async () => null,
        getActivePrincipal: async () => null,
        startLogin: async () => ({ status: "issued" as const, url: "https://app.example/login?t=token-secreto" }),
        logout: async () => undefined,
      },
    });

    const result = await useCase.execute({
      channel: "WEB",
      contactId: "570000000001",
      name: "Ana",
      text: "hola",
    });

    expect(result.reply).toContain("token-secreto");
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).not.toContain("token-secreto");
  });
});
