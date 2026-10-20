import { describe, expect, it, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import { WebChatAdapter } from "../infrastructure/web-chat-adapter.js";
import { HandleInboundMessageUseCase } from "../../bot/application/handle-inbound-message.js";
import { webChatRoutes } from "./web-chat-routes.js";
import { ProcessIncomingMessageUseCase } from "../../bot/application/process-incoming-message.js";
import type { InboundConversationPorts, UserAccountPort } from "../../bot/application/process-incoming-message.js";

function makePorts(): InboundConversationPorts {
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
  };
}

describe("web chat routes /dev/chat", () => {
  let server: Server;
  let base: string;

  beforeEach(async () => {
    const app = express();
    app.use(express.json());
    const adapter = new WebChatAdapter();
    const processor = new ProcessIncomingMessageUseCase({
      users: { findOrCreateUser: async () => ({ id: "u1" }) } as UserAccountPort,
      conversations: makePorts(),
      knowledge: { findAnswer: async () => "respuesta" },
    });
    const handleInbound = new HandleInboundMessageUseCase({ processor, adapter });
    app.use("/dev/chat", webChatRoutes({ adapter, handleInbound }));
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error();
    base = `http://127.0.0.1:${addr.port}/dev/chat`;
  });

  afterEach(() => server.close());

  it("GET /test-phones devuelve lista fija", async () => {
    const res = await fetch(`${base}/test-phones`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { phones: string[] };
    expect(json.phones).toContain("570000000001");
    expect(json.phones.length).toBe(5);
  });

  it("POST /messages rechaza teléfono no permitido con 422", async () => {
    const res = await fetch(`${base}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "573143900375", name: "X", text: "hola" }),
    });
    expect(res.status).toBe(422);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /messages acepta teléfono de prueba", async () => {
    const res = await fetch(`${base}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "570000000001", name: "Ana", text: "hola" }),
    });
    expect(res.status).toBe(200);
  });

  it("GET /messages valida teléfonos con 422", async () => {
    const res = await fetch(`${base}/messages?phone=573143900375&afterId=0`);
    expect(res.status).toBe(422);
  });
});