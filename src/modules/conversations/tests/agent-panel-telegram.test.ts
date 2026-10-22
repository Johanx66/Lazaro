import { describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import { AgentPanelController } from "../presentation/agent-panel-controller.js";
import { agentPanelRoutes } from "../presentation/agent-panel-routes.js";
import type { ConversationRepository } from "../domain/repositories/conversation-repository.js";
import type { Conversation } from "../domain/entities/conversation.js";
import type { ChannelAdapter } from "../../../channels/domain/channel-adapter.js";
import type { UserRepository } from "../../users/domain/repositories/user-repository.js";
import type { User } from "../../users/domain/entities/user.js";

const HOUR = 60 * 60 * 1000;

const conversation: Conversation = {
  id: "c-tg",
  userId: "u1",
  channel: "TELEGRAM",
  status: "WAITING_AGENT",
  assignedAgentId: null,
  startedAt: new Date(),
  endedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const user: User = {
  id: "u1",
  name: "Ana Cliente",
  phone: "570123456789",
  email: null,
  externalCustomerId: "telegram-570123456789",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeApp(lastUserMessageAt?: Date) {
  const send = vi.fn().mockResolvedValue(undefined);
  const sentMessages: unknown[] = [];

  const conversationRepository: ConversationRepository = {
    create: async () => conversation,
    findById: async (id) => (id === conversation.id ? conversation : null),
    findActiveByUserIdAndChannel: async () => null,
    findWaitingForAgent: async () => [conversation],
    findClosed: async () => [],
    update: async (id, data) => (id === conversation.id ? { ...conversation, ...data } : null),
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
    listMessages: async () => {
      if (!lastUserMessageAt) return [];
      return [
        {
          id: "m-user",
          conversationId: conversation.id,
          senderType: "USER",
          content: "hola",
          metadata: null,
          createdAt: lastUserMessageAt,
        },
      ];
    },
  };

  const userRepository: UserRepository = {
    create: async (input) => ({ ...user, ...input }),
    findById: async (id) => (id === user.id ? user : null),
    findByPhone: async () => null,
    update: async () => user,
  };

  const webAdapter = { channel: "WEB", parseInbound: async () => null, send } as unknown as ChannelAdapter;
  const telegramAdapter = { channel: "TELEGRAM", parseInbound: async () => null, send } as unknown as ChannelAdapter;

  const app = express();
  app.use(express.json());
  const controller = new AgentPanelController({
    conversationRepository,
    userRepository,
    webAdapter,
    telegramAdapter,
  });
  app.use("/api/agent/conversations", agentPanelRoutes(controller));

  return { app, send, sentMessages };
}

async function start(app: ReturnType<typeof makeApp>["app"]) {
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("sin puerto");
  return { server, base: `http://127.0.0.1:${addr.port}/api/agent/conversations` };
}

describe("AgentPanelController con canal TELEGRAM", () => {
  it("el agente puede responder sin ventana de 24h (también con el último mensaje antiguo)", async () => {
    const { app, send, sentMessages } = makeApp(new Date(Date.now() - 48 * HOUR));
    const { server, base } = await start(app);
    try {
      const res = await fetch(`${base}/c-tg/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Te ayudo con eso" }),
      });
      expect(res.status).toBe(201);
      expect(send).toHaveBeenCalledWith("570123456789", { text: "Te ayudo con eso", sender: "AGENT" });
      expect(sentMessages).toContainEqual(
        expect.objectContaining({ senderType: "AGENT", content: "Te ayudo con eso" }),
      );
    } finally {
      server.close();
    }
  });

  it("sin adaptador de Telegram configurado responde 400 y no envía", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const app = express();
    app.use(express.json());
    const controller = new AgentPanelController({
      conversationRepository: {
        create: async () => conversation,
        findById: async () => conversation,
        findActiveByUserIdAndChannel: async () => null,
        findWaitingForAgent: async () => [],
        findClosed: async () => [],
        update: async () => conversation,
        addMessage: async () => ({
          id: "m",
          conversationId: "c-tg",
          senderType: "AGENT",
          content: "x",
          metadata: null,
          createdAt: new Date(),
        }),
        recordEvent: async () => undefined,
        listMessages: async () => [],
        hasAgentMessage: async () => false,
      },
      userRepository: {
        create: async (input) => ({ ...user, ...input }),
        findById: async () => user,
        findByPhone: async () => null,
        update: async () => user,
      },
      webAdapter: { channel: "WEB", parseInbound: async () => null, send } as unknown as ChannelAdapter,
    });
    app.use("/api/agent/conversations", agentPanelRoutes(controller));

    const { server, base } = await start(app);
    try {
      const res = await fetch(`${base}/c-tg/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Hola" }),
      });
      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: { code: string } };
      expect(data.error.code).toBe("BAD_REQUEST");
      expect(send).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
  });
});
