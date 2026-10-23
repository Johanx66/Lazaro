import { describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import { AgentPanelController } from "../presentation/agent-panel-controller.js";
import { agentPanelRoutes } from "../presentation/agent-panel-routes.js";
import type { ConversationRepository } from "../domain/repositories/conversation-repository.js";
import type { Conversation, Message } from "../domain/entities/conversation.js";
import type { ListMessagesOptions } from "../domain/repositories/conversation-repository.js";
import type { ChannelAdapter } from "../../../channels/domain/channel-adapter.js";
import type { UserRepository } from "../../users/domain/repositories/user-repository.js";
import type { User } from "../../users/domain/entities/user.js";

const HOUR = 60 * 60 * 1000;

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "c1",
    userId: "u1",
    channel: "WEB",
    status: "WAITING_AGENT",
    assignedAgentId: null,
    startedAt: new Date(),
    endedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const user: User = {
  id: "u1",
  name: "Ana Cliente",
  phone: "570000000001",
  email: null,
  externalCustomerId: "web-570000000001",
  createdAt: new Date(),
  updatedAt: new Date(),
};

interface Options {
  channel?: "WEB" | "WHATSAPP";
  lastUserMessageAt?: Date;
  closed?: Conversation[];
}

function makeApp(send: ReturnType<typeof vi.fn>, options: Options = {}) {
  const conversation = makeConversation({ channel: options.channel ?? "WEB" });
  const sentMessages: unknown[] = [];
  const update = vi.fn(async (id: string, data: Parameters<ConversationRepository["update"]>[1]) =>
    id === conversation.id ? { ...conversation, ...data } : null,
  );

  const conversationRepository: ConversationRepository = {
    create: async () => conversation,
    findById: async (id) => (id === conversation.id ? conversation : null),
    findActiveByUserIdAndChannel: async () => null,
    findWaitingForAgent: async () => [conversation],
    findClosed: async () => options.closed ?? [],
    update,
    addMessage: async (data) => {
      sentMessages.push(data);
      return {
        id: "m",
        conversationId: data.conversationId,
        senderType: data.senderType,
        content: data.content,
        metadata: data.metadata ?? null,
        createdAt: new Date(),
      };
    },
    recordEvent: async () => undefined,
    hasAgentMessage: async () => false,
    listMessages: async (_conversationId, listOptions) => {
      listMessagesOptions.push(listOptions);
      if (listOptions.after) {
        const createdAt = new Date(listOptions.after.createdAt.getTime() + 1000);
        return [{
          id: "m-agent",
          conversationId: conversation.id,
          senderType: "AGENT",
          content: "Respuesta reciente",
          metadata: null,
          createdAt,
        }];
      }
      if (!options.lastUserMessageAt) return [];
      return [
        {
          id: "m-user",
          conversationId: conversation.id,
          senderType: "USER",
          content: "hola",
          metadata: null,
          createdAt: options.lastUserMessageAt,
        },
      ];
    },
  };
  const listMessagesOptions: ListMessagesOptions[] = [];

  const userRepository: UserRepository = {
    create: async (input) => ({ ...user, ...input }),
    findById: async (id) => (id === user.id ? user : null),
    findByPhone: async () => null,
    update: async () => user,
  };

  const webAdapter = { channel: "WEB", parseInbound: async () => null, send } as unknown as ChannelAdapter;
  const whatsappAdapter = { channel: "WHATSAPP", parseInbound: async () => null, send } as unknown as ChannelAdapter;

  const app = express();
  app.use(express.json());
  const controller = new AgentPanelController({
    conversationRepository,
    userRepository,
    webAdapter,
    whatsappAdapter,
  });
  app.use("/api/agent/conversations", agentPanelRoutes(controller));

  return { app, send, sentMessages, update, listMessagesOptions };
}

async function start(app: ReturnType<typeof makeApp>["app"]) {
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("sin puerto");
  return { server, base: `http://127.0.0.1:${addr.port}/api/agent/conversations` };
}

describe("AgentPanelController", () => {
  it("permite sondear solo los mensajes posteriores al cursor y evita caché", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { app, listMessagesOptions } = makeApp(send);
    const { server, base } = await start(app);
    const createdAt = new Date("2026-10-23T10:00:00.000Z");
    try {
      const res = await fetch(
        `${base}/c1/messages?after=${encodeURIComponent(`${createdAt.toISOString()}|m-user`)}`,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const data = (await res.json()) as { messages: Message[] };
      expect(data.messages.map(({ id }) => id)).toEqual(["m-agent"]);
      expect(listMessagesOptions[0]).toMatchObject({
        limit: 50,
        after: { createdAt, id: "m-user" },
      });
    } finally {
      server.close();
    }
  });

  it("rechaza cursores de sondeo inválidos o la combinación de dos cursores", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { app } = makeApp(send);
    const { server, base } = await start(app);
    try {
      const invalid = await fetch(`${base}/c1/messages?after=not-a-cursor`);
      const both = await fetch(
        `${base}/c1/messages?before=${encodeURIComponent("2026-10-23T10:00:00.000Z|m1")}&after=${encodeURIComponent("2026-10-23T10:00:00.000Z|m2")}`,
      );
      expect(invalid.status).toBe(422);
      expect(both.status).toBe(422);
    } finally {
      server.close();
    }
  });

  it("la lista de espera expone el teléfono y el nombre reales del cliente", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { app } = makeApp(send);
    const { server, base } = await start(app);
    try {
      const res = await fetch(`${base}/waiting`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { conversations: Array<{ userPhone: string; userName: string }> };
      expect(data.conversations[0]).toMatchObject({ userPhone: "570000000001", userName: "Ana Cliente" });
    } finally {
      server.close();
    }
  });

  it("el historial lista las conversaciones cerradas con el contacto del cliente", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const closed = makeConversation({
      id: "c-closed",
      status: "CLOSED",
      endedAt: new Date(),
    });
    const { app } = makeApp(send, { closed: [closed] });
    const { server, base } = await start(app);
    try {
      const res = await fetch(`${base}/history`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        conversations: Array<{ id: string; status: string; userPhone: string; userName: string }>;
      };
      expect(data.conversations).toHaveLength(1);
      expect(data.conversations[0]).toMatchObject({
        id: "c-closed",
        status: "CLOSED",
        userPhone: "570000000001",
        userName: "Ana Cliente",
      });
    } finally {
      server.close();
    }
  });

  it("el agente responde por el canal de origen al teléfono del cliente (sender AGENT)", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { app, sentMessages, update } = makeApp(send, { channel: "WEB" });
    const { server, base } = await start(app);
    try {
      const res = await fetch(`${base}/c1/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Ya quedó resuelto" }),
      });
      expect(res.status).toBe(201);
      expect(send).toHaveBeenCalledWith("570000000001", { text: "Ya quedó resuelto", sender: "AGENT" });
      expect(sentMessages).toContainEqual(
        expect.objectContaining({ senderType: "AGENT", content: "Ya quedó resuelto" }),
      );
      expect(update).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
  });

  it("texto vacío responde 422", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { app } = makeApp(send);
    const { server, base } = await start(app);
    try {
      const res = await fetch(`${base}/c1/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "   " }),
      });
      expect(res.status).toBe(422);
      expect(send).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
  });

  it("en WhatsApp con la ventana de 24h vencida bloquea el envío libre (409)", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { app } = makeApp(send, { channel: "WHATSAPP", lastUserMessageAt: new Date(Date.now() - 25 * HOUR) });
    const { server, base } = await start(app);
    try {
      const res = await fetch(`${base}/c1/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Hola" }),
      });
      expect(res.status).toBe(409);
      const data = (await res.json()) as { error: { code: string } };
      expect(data.error.code).toBe("WHATSAPP_WINDOW_EXPIRED");
      expect(send).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
  });

  it("en WhatsApp dentro de la ventana permite responder", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { app } = makeApp(send, { channel: "WHATSAPP", lastUserMessageAt: new Date(Date.now() - HOUR) });
    const { server, base } = await start(app);
    try {
      const res = await fetch(`${base}/c1/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Te respondo" }),
      });
      expect(res.status).toBe(201);
      expect(send).toHaveBeenCalledWith("570000000001", { text: "Te respondo", sender: "AGENT" });
    } finally {
      server.close();
    }
  });

  it("conversación inexistente responde 404", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { app } = makeApp(send);
    const { server, base } = await start(app);
    try {
      const res = await fetch(`${base}/c-x/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Hola" }),
      });
      expect(res.status).toBe(404);
      expect(send).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
  });
});
