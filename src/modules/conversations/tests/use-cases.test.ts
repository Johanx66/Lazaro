import { describe, expect, it } from "vitest";
import { AddBotReplyUseCase } from "../../../../src/modules/conversations/application/use-cases/add-bot-reply.js";
import { GetConversationUseCase } from "../../../../src/modules/conversations/application/use-cases/get-conversation.js";
import { HandleNonTextEventUseCase } from "../../../../src/modules/conversations/application/use-cases/handle-non-text-event.js";
import { SendMessageUseCase } from "../../../../src/modules/conversations/application/use-cases/send-message.js";
import { StartConversationUseCase } from "../../../../src/modules/conversations/application/use-cases/start-conversation.js";
import type { Conversation } from "../../../../src/modules/conversations/domain/entities/conversation.js";
import type { Message } from "../../../../src/modules/conversations/domain/entities/conversation.js";
import type { ConversationRepository } from "../../../../src/modules/conversations/domain/repositories/conversation-repository.js";
import type { AddMessageData } from "../../../../src/modules/conversations/domain/repositories/conversation-repository.js";
import type { AddEventData } from "../../../../src/modules/conversations/domain/repositories/conversation-repository.js";
import type { CreateConversationData } from "../../../../src/modules/conversations/domain/repositories/conversation-repository.js";
import type { UpdateConversationData } from "../../../../src/modules/conversations/domain/repositories/conversation-repository.js";
import { InvalidTransitionError } from "../../../../src/modules/conversations/domain/state-machine.js";
import { NotFoundError, ValidationError } from "../../../../src/shared/errors/app.error.js";

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "c1",
    userId: "u1",
    channel: "WHATSAPP",
    status: "CLOSED",
    assignedAgentId: null,
    startedAt: new Date("2026-01-01T00:00:00.000Z"),
    endedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeRepository(overrides: Partial<ConversationRepository> = {}): ConversationRepository {
  const store = new Map<string, Conversation>();
  const messages = new Map<string, Message>();
  const events: AddEventData[] = [];
  let seq = 0;

  return {
    create:
      overrides.create ??
      (async (data: CreateConversationData) => {
        const now = new Date("2026-01-02T00:00:00.000Z");
        const conversation: Conversation = {
          id: `c-${++seq}`,
          userId: data.userId,
          channel: data.channel,
          status: data.status,
          assignedAgentId: data.assignedAgentId,
          startedAt: now,
          endedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        store.set(conversation.id, conversation);
        return conversation;
      }),
    findById: overrides.findById ?? (async (id) => store.get(id) ?? null),
    findActiveByUserIdAndChannel:
      overrides.findActiveByUserIdAndChannel ??
      (async (userId, channel) =>
        [...store.values()].find(
          (c) => c.userId === userId && c.channel === channel && !["RESOLVED", "CLOSED"].includes(c.status),
        ) ?? null),
    findWaitingForAgent: overrides.findWaitingForAgent ?? (async () => []),
    findClosed: overrides.findClosed ?? (async () => []),
    update:
      overrides.update ??
      (async (id: string, data: UpdateConversationData) => {
        const current = store.get(id);
        if (!current) return null;
        const updated: Conversation = {
          ...current,
          status: data.status,
          endedAt: data.endedAt !== undefined ? data.endedAt : current.endedAt,
          assignedAgentId:
            data.assignedAgentId !== undefined ? data.assignedAgentId : current.assignedAgentId,
          updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        };
        store.set(id, updated);
        return updated;
      }),
    addMessage:
      overrides.addMessage ??
      (async (data: AddMessageData) => {
        const message: Message = {
          id: `m-${messages.size + 1}`,
          conversationId: data.conversationId,
          senderType: data.senderType,
          content: data.content,
          metadata: data.metadata ?? null,
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
        };
        messages.set(message.id, message);
        return message;
      }),
    recordEvent: overrides.recordEvent ?? (async (data: AddEventData) => void events.push(data)),
    listMessages:
      overrides.listMessages ??
      (async (conversationId, options) =>
        [...messages.values()]
          .filter((m) => m.conversationId === conversationId)
          .slice(-options.limit)),
  };
}

const resolveKnownUser = (id: string) => Promise.resolve(id === "u1" ? { id: "u1" } : null);

describe("StartConversationUseCase", () => {
  it("crea una conversación nueva en estado CLOSED", async () => {
    const useCase = new StartConversationUseCase(
      { repository: makeRepository(), findUser: resolveKnownUser },
    );
    const conversation = await useCase.execute({ userId: "u1", channel: "WHATSAPP" });
    expect(conversation.status).toBe("CLOSED");
    expect(conversation.userId).toBe("u1");
    expect(conversation.channel).toBe("WHATSAPP");
    expect(conversation.assignedAgentId).toBeNull();
  });

  it("retorna la conversación activa existente (falsa creación idempotente)", async () => {
    let createCalls = 0;
    const existing = makeConversation({ status: "BOT_HANDLING" });
    const useCase = new StartConversationUseCase(
      {
        repository: makeRepository({
          findActiveByUserIdAndChannel: async () => existing,
          create: async () => {
            createCalls += 1;
            return makeConversation();
          },
        }),
        findUser: resolveKnownUser,
      },
    );
    const result = await useCase.execute({ userId: "u1", channel: "WHATSAPP" });
    expect(result).toBe(existing);
    expect(createCalls).toBe(0);
  });

  it("lanza NotFound si el usuario no existe", async () => {
    const useCase = new StartConversationUseCase(
      { repository: makeRepository(), findUser: resolveKnownUser },
    );
    await expect(
      useCase.execute({ userId: "no-existe", channel: "WHATSAPP" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rechaza canal vacío", async () => {
    const useCase = new StartConversationUseCase(
      { repository: makeRepository(), findUser: resolveKnownUser },
    );
    await expect(useCase.execute({ userId: "u1", channel: "  " })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("GetConversationUseCase", () => {
  it("devuelve la conversación existente", async () => {
    const useCase = new GetConversationUseCase(makeRepository({ findById: async () => makeConversation() }));
    await expect(useCase.execute("c1")).resolves.toMatchObject({ id: "c1" });
  });

  it("lanza NotFound si no existe", async () => {
    const useCase = new GetConversationUseCase(makeRepository({ findById: async () => null }));
    await expect(useCase.execute("c-x")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("SendMessageUseCase", () => {
  it("el primer mensaje desde CLOSED la lleva a BOT_HANDLING", async () => {
    const repo = makeRepository({ findById: async () => makeConversation({ status: "CLOSED" }) });
    const useCase = new SendMessageUseCase(repo);
    const result = await useCase.execute({ conversationId: "c1", userId: "u1", content: "Hola" });
    expect(result.status).toBe("BOT_HANDLING");
    expect(result.message).toMatchObject({ conversationId: "c1", senderType: "USER", content: "Hola" });
  });

  it("un mensaje adicional mantiene BOT_HANDLING", async () => {
    const repo = makeRepository({ findById: async () => makeConversation({ status: "BOT_HANDLING" }) });
    const useCase = new SendMessageUseCase(repo);
    await expect(useCase.execute({ conversationId: "c1", userId: "u1", content: "Hola" })).resolves.toMatchObject({ status: "BOT_HANDLING" });
  });

  it("lanza NotFound si la conversación no existe", async () => {
    const useCase = new SendMessageUseCase(makeRepository({ findById: async () => null }));
    await expect(
      useCase.execute({ conversationId: "c-x", userId: "u1", content: "Hola" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lanza NotFound si el mensaje no pertenece al usuario", async () => {
    const repo = makeRepository({ findById: async () => makeConversation({ userId: "otro" }) });
    const useCase = new SendMessageUseCase(repo);
    await expect(
      useCase.execute({ conversationId: "c1", userId: "u1", content: "Hola" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rechaza contenido vacío", async () => {
    const useCase = new SendMessageUseCase(makeRepository());
    await expect(
      useCase.execute({ conversationId: "c1", userId: "u1", content: "   " }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("HandleNonTextEventUseCase", () => {
  it("INTENT_NOT_RECOGNIZED desde BOT_HANDLING transfiere a WAITING_AGENT", async () => {
    const repo = makeRepository({ findById: async () => makeConversation({ status: "BOT_HANDLING" }) });
    const useCase = new HandleNonTextEventUseCase(repo);
    const result = await useCase.execute({ conversationId: "c1", eventType: "INTENT_NOT_RECOGNIZED" });
    expect(result.appliedEvent).toBe("TRANSFERRED_TO_HUMAN");
    expect(result.status).toBe("WAITING_AGENT");
    expect(result.message.senderType).toBe("SYSTEM");
  });

  it("MEDIA mantiene BOT_HANDLING", async () => {
    const repo = makeRepository({ findById: async () => makeConversation({ status: "BOT_HANDLING" }) });
    const useCase = new HandleNonTextEventUseCase(repo);
    const result = await useCase.execute({ conversationId: "c1", eventType: "MEDIA" });
    expect(result.appliedEvent).toBe("MESSAGE_RECEIVED");
    expect(result.status).toBe("BOT_HANDLING");
  });

  it("acepta el evento en minúsculas", async () => {
    const repo = makeRepository({ findById: async () => makeConversation({ status: "BOT_HANDLING" }) });
    const useCase = new HandleNonTextEventUseCase(repo);
    const result = await useCase.execute({ conversationId: "c1", eventType: "media" });
    expect(result.appliedEvent).toBe("MESSAGE_RECEIVED");
  });

  it("rechaza un evento no soportado", async () => {
    const useCase = new HandleNonTextEventUseCase(makeRepository());
    await expect(
      useCase.execute({ conversationId: "c1", eventType: "FALLO_CUSTOM" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("lanza NotFound si la conversación no existe", async () => {
    const useCase = new HandleNonTextEventUseCase(makeRepository({ findById: async () => null }));
    await expect(
      useCase.execute({ conversationId: "c-x", eventType: "MEDIA" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("no permite una transición inválida desde CLOSED (puerta cerrada)", async () => {
    const repo = makeRepository({ findById: async () => makeConversation({ status: "CLOSED" }) });
    const useCase = new HandleNonTextEventUseCase(repo);
    await expect(
      useCase.execute({ conversationId: "c1", eventType: "INTENT_NOT_RECOGNIZED" }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });
});

describe("AddBotReplyUseCase", () => {
  it("la respuesta del bot desde BOT_HANDLING pasa a WAITING_USER", async () => {
    const repo = makeRepository({
      findById: async () => makeConversation({ status: "BOT_HANDLING" }),
    });
    const useCase = new AddBotReplyUseCase(repo);
    const result = await useCase.execute("c1", "  Gracias por tu mensaje  ");
    expect(result.status).toBe("WAITING_USER");
    expect(result.message).toMatchObject({
      conversationId: "c1",
      senderType: "BOT",
      content: "Gracias por tu mensaje",
    });
  });

  it("lanza NotFound si la conversación no existe", async () => {
    const useCase = new AddBotReplyUseCase(makeRepository({ findById: async () => null }));
    await expect(useCase.execute("c-x", "respuesta")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rechaza respuestas vacías", async () => {
    const useCase = new AddBotReplyUseCase(makeRepository());
    await expect(useCase.execute("c1", "   ")).rejects.toBeInstanceOf(ValidationError);
  });

  it("no permite responder con el bot desde CLOSED (puerta cerrada)", async () => {
    const repo = makeRepository({ findById: async () => makeConversation({ status: "CLOSED" }) });
    const useCase = new AddBotReplyUseCase(repo);
    await expect(useCase.execute("c1", "respuesta")).rejects.toBeInstanceOf(InvalidTransitionError);
  });
});