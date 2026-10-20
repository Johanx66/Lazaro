import { describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import { WebChatAdapter } from "../infrastructure/web-chat-adapter.js";
import { HandleInboundMessageUseCase } from "../../bot/application/handle-inbound-message.js";
import { webChatRoutes } from "./web-chat-routes.js";
import { ProcessIncomingMessageUseCase } from "../../bot/application/process-incoming-message.js";
import type { InboundConversationPorts, UserAccountPort } from "../../bot/application/process-incoming-message.js";
import type { AgentNotifier } from "../../connectors/domain/agent-notifier.js";
import type { TransferToHumanResult } from "../../modules/conversations/application/use-cases/transfer-to-human.js";

function makePorts(waiting: boolean = false): InboundConversationPorts {
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
    recordBotReply: async () => ({
      conversationId: "c1",
      message: { id: "m2", conversationId: "c1", senderType: "BOT", content: "ok", metadata: null, createdAt: new Date() },
      status: "WAITING_USER",
    }),
    handleNonTextEvent: async () => ({
      conversationId: "c1",
      appliedEvent: "TRANSFERRED_TO_HUMAN",
      message: { id: "m3", conversationId: "c1", senderType: "SYSTEM", content: "x", metadata: null, createdAt: new Date() },
      status: "WAITING_AGENT",
    }),
    transferToHuman: async () => ({
      conversationId: "c1",
      ticketId: "t1",
      assignedAgentId: null,
      status: "WAITING_AGENT",
      messageToCustomer: "Todos los agentes están ocupados. Tu solicitud está en cola y te atenderán en orden de llegada.",
    } satisfies TransferToHumanResult),
    getConversation: async () => null,
  };
}

async function setup() {
  const app = express();
  app.use(express.json());
  const adapter = new WebChatAdapter();
  const notify = vi.fn().mockResolvedValue([{ channel: "webhook", status: "sent", detail: "ok" }]);
  const notifier: AgentNotifier = { notify };
  const processor = new ProcessIncomingMessageUseCase({
    users: { findOrCreateUser: async () => ({ id: "u1" }) } as UserAccountPort,
    conversations: makePorts(),
    knowledge: { findAnswer: async () => null },
  });
  const handleInbound = new HandleInboundMessageUseCase({ processor, adapter, notifier });
  app.use("/dev/chat", webChatRoutes({ adapter, handleInbound }));
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error();
  const base = `http://127.0.0.1:${addr.port}/dev/chat`;
  return { server, base, notify };
}

async function postAgente(base: string): Promise<Response> {
  return fetch(`${base}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: "570000000001", name: "Ana", text: "agente" }),
  });
}

describe("web chat flujo WAITING_AGENT", () => {
  it("POST + GET con cursor", async () => {
    const { server, base } = await setup();
    try {
      const post = await postAgente(base);
      expect(post.status).toBe(200);
      const get0 = await fetch(`${base}/messages?phone=570000000001&afterId=0`);
      expect(get0.status).toBe(200);
      const j0 = (await get0.json()) as { messages: Array<{ id: number; text: string }>; nextCursor: number };
      expect(j0.messages.length).toBe(1);
      expect(j0.messages[0]!.text).toContain("orden de llegada");
      const get1 = await fetch(`${base}/messages?phone=570000000001&afterId=${j0.messages[0]!.id}`);
      expect(get1.status).toBe(200);
      const j1 = (await get1.json()) as { messages: Array<{ id: number; text: string }>; nextCursor: number };
      expect(j1.messages.length).toBe(0);
    } finally {
      server.close();
    }
  });

  it("flujo web → WAITING_AGENT con notificación", async () => {
    const { server, base, notify } = await setup();
    try {
      const post = await postAgente(base);
      expect(post.status).toBe(200);
      expect(notify).toHaveBeenCalledTimes(1);
    } finally {
      server.close();
    }
  });
});
