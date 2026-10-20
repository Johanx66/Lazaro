import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import express from "express";
import type { Server } from "http";
import { ProcessIncomingMessageUseCase } from "../application/process-incoming-message.js";
import type { InboundConversationPorts, UserAccountPort } from "../application/process-incoming-message.js";
import { CompositeKnowledgeRepository, StaticKnowledgeBase, scoreMatch, selectBestMatch } from "../domain/knowledge.js";
import type { KnowledgeArticle } from "../domain/knowledge.js";
import { whatsappWebhookRouter } from "../presentation/whatsapp-webhook.js";
import { HandleInboundMessageUseCase } from "../application/handle-inbound-message.js";
import { WhatsAppAdapter } from "../../channels/infrastructure/whatsapp-adapter.js";
import type { AgentNotifier } from "../../connectors/domain/agent-notifier.js";

const SAMPLE_ARTICLES: KnowledgeArticle[] = [
  {
    id: "a1",
    title: "Cómo reiniciar la contraseña",
    content: "Enviamos un enlace de restablecimiento a tu correo registrado.",
    keywords: ["contraseña", "password", "clave"],
  },
  {
    id: "a2",
    title: "Horario de atención",
    content: "Atención de lunes a viernes de 8:00 a 18:00.",
    keywords: ["horario", "atención"],
  },
];

describe("selección de respuestas de la base de conocimiento", () => {
  it("puntúa por coincidencia de palabras clave", () => {
    const score = scoreMatch("quiero reiniciar mi contraseña", SAMPLE_ARTICLES[0]!);
    expect(score).toBeGreaterThan(0);
  });

  it("elige el artículo con mayor coincidencia", () => {
    const answer = selectBestMatch("¿cuál es el horario de atención?", SAMPLE_ARTICLES, 0.5);
    expect(answer).toContain("lunes a viernes");
  });

  it("no encuentra respuesta sin coincidencias", () => {
    expect(selectBestMatch("zzz qqq wx", SAMPLE_ARTICLES, 0.5)).toBeNull();
  });

  it("la KB estática saluda y transfiere 'agente' como sin respuesta", async () => {
    const kb = new StaticKnowledgeBase();
    await expect(kb.findAnswer("hola buenas")).resolves.toContain("asistente");
    await expect(kb.findAnswer("quiero hablar con un agente humano")).resolves.toBeNull();
  });

  it("el composite consulta en orden hasta hallar respuesta", async () => {
    const composite = new CompositeKnowledgeRepository([
      { findAnswer: async () => null },
      { findAnswer: async () => "respuesta desde el segundo" },
    ]);
    await expect(composite.findAnswer("x")).resolves.toBe("respuesta desde el segundo");
  });

  it("el composite continúa si una fuente lanza un error", async () => {
    const composite = new CompositeKnowledgeRepository([
      { findAnswer: async () => {
        throw new Error("base de datos caída");
      } },
      { findAnswer: async () => "responde tras el fallo" },
    ]);
    await expect(composite.findAnswer("x")).resolves.toBe("responde tras el fallo");
  });

  it("el composite devuelve null si todas las fuentes fallan", async () => {
    const composite = new CompositeKnowledgeRepository([
      { findAnswer: async () => {
        throw new Error("base de datos caída");
      } },
    ]);
    await expect(composite.findAnswer("x")).resolves.toBeNull();
  });
});

describe("ProcessIncomingMessageUseCase", () => {
  function makePorts(overrides: Partial<InboundConversationPorts> = {}): InboundConversationPorts {
    return {
      startConversation:
        overrides.startConversation ??
        (async (input) => ({
          id: "c1",
          userId: input.userId,
          channel: input.channel,
          status: "CLOSED",
          assignedAgentId: null,
          startedAt: new Date(),
          endedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      sendMessage: overrides.sendMessage ?? (async () => ({ conversationId: "c1", message: { id: "m1", conversationId: "c1", senderType: "USER", content: "x", metadata: null, createdAt: new Date() }, status: "BOT_HANDLING" })),
      recordBotReply:
        overrides.recordBotReply ??
        (async () => ({ conversationId: "c1", message: { id: "m2", conversationId: "c1", senderType: "BOT", content: "x", metadata: null, createdAt: new Date() }, status: "WAITING_USER" })),
      handleNonTextEvent:
        overrides.handleNonTextEvent ??
        (async () => ({ conversationId: "c1", appliedEvent: "TRANSFERRED_TO_HUMAN", message: { id: "m3", conversationId: "c1", senderType: "SYSTEM", content: "x", metadata: null, createdAt: new Date() }, status: "WAITING_AGENT" })),
    };
  }

  const users: UserAccountPort = {
    findOrCreateUser: async () => ({ id: "u1" }),
  };

  it("responde por el bot cuando la KB encuentra la respuesta", async () => {
    let sent = false;
    let replied = false;
    const useCase = new ProcessIncomingMessageUseCase({
      users,
      conversations: makePorts({
        sendMessage: async () => {
          sent = true;
          return { conversationId: "c1", message: { id: "m1", conversationId: "c1", senderType: "USER", content: "hola", metadata: null, createdAt: new Date() }, status: "BOT_HANDLING" };
        },
        recordBotReply: async (_id, content) => {
          replied = true;
          return { conversationId: "c1", message: { id: "m2", conversationId: "c1", senderType: "BOT", content, metadata: null, createdAt: new Date() }, status: "WAITING_USER" };
        },
      }),
      knowledge: { findAnswer: async () => "respuesta de ejemplo" },
    });

    const result = await useCase.execute({ channel: "WHATSAPP", contactId: "573001234567", name: "Ana", text: "hola" });
    expect(sent).toBe(true);
    expect(replied).toBe(true);
    expect(result).toMatchObject({ reply: "respuesta de ejemplo", handledByBot: true, status: "WAITING_USER" });
  });

  it("transfiere a agente humano y responde con fallback cuando no hay respuesta", async () => {
    let transferred = false;
    const useCase = new ProcessIncomingMessageUseCase({
      users,
      conversations: makePorts({
        handleNonTextEvent: async (input) => {
          transferred = input.eventType === "INTENT_NOT_RECOGNIZED";
          return { conversationId: "c1", appliedEvent: "TRANSFERRED_TO_HUMAN", message: { id: "m3", conversationId: "c1", senderType: "SYSTEM", content: "x", metadata: null, createdAt: new Date() }, status: "WAITING_AGENT" };
        },
      }),
      knowledge: { findAnswer: async () => null },
    });

    const result = await useCase.execute({ channel: "WHATSAPP", contactId: "573001234567", name: "Ana", text: "un texto sin respuesta" });
    expect(transferred).toBe(true);
    expect(result).toMatchObject({ handledByBot: false, status: "WAITING_AGENT" });
    expect(result.reply).toContain("agente humano");
  });

  it("reutiliza el usuario existente sin crearlo de nuevo", async () => {
    let createCalls = 0;
    const useCase = new ProcessIncomingMessageUseCase({
      users: {
        findOrCreateUser: async () => {
          createCalls += 1;
          return { id: "u1" };
        },
      },
      conversations: makePorts(),
      knowledge: { findAnswer: async () => "ok" },
    });
    await useCase.execute({ channel: "WHATSAPP", contactId: "573001234567", name: "", text: "hola" });
    expect(createCalls).toBe(1);
  });
});

describe("WhatsAppAdapter.parseInbound", () => {
  const adapter = new WhatsAppAdapter({ sendText: async () => undefined });

  it("extrae teléfono, nombre y texto de un payload válido", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ from: "573001234567", text: { body: "  Hola, necesito ayuda  " } }],
                contacts: [{ profile: { name: "Ana López" } }],
              },
            },
          ],
        },
      ],
    };
    expect(adapter.parseInbound(payload)).toEqual({
      channel: "WHATSAPP",
      contactId: "573001234567",
      name: "Ana López",
      text: "Hola, necesito ayuda",
    });
  });

  it("devuelve null sin mensajes", () => {
    expect(adapter.parseInbound({ entry: [{ changes: [{ value: {} }] }] })).toBeNull();
  });

  it("devuelve null si el texto está vacío", () => {
    expect(
      adapter.parseInbound({
        entry: [{ changes: [{ value: { messages: [{ from: "57", text: { body: "  " } }] } }] }],
      }),
    ).toBeNull();
  });

  it("devuelve null ante un payload inválido", () => {
    expect(adapter.parseInbound(null)).toBeNull();
    expect(adapter.parseInbound("texto")).toBeNull();
  });
});

const APP_SECRET = "secreto-de-prueba";
const sign = (body: string, secret = APP_SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("whatsappWebhookRouter + conectores", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              messages: [{ from: "573001234567", id: "w1", timestamp: "1780000000", text: { body: "agente" } }],
              contacts: [{ profile: { name: "Ana" } }],
            },
          },
        ],
      },
    ],
  };

  function createApp(notifier: AgentNotifier | undefined) {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const app = express();
    app.use(express.json({ verify: (req, _res, buf) => { (req as unknown as { rawBody: Buffer }).rawBody = Buffer.from(buf); } }));
    const processor = {
      execute: async () => ({
        conversationId: "c1",
        reply: "No pude resolver tu consulta. Un agente humano te atenderá en unos instantes.",
        handledByBot: false,
        status: "WAITING_AGENT",
      }),
    };
    const adapter = new WhatsAppAdapter({ sendText });
    const handleInbound = new HandleInboundMessageUseCase({
      processor: processor as never,
      adapter,
      notifier,
    });
    app.use(
      "/webhooks/whatsapp",
      whatsappWebhookRouter({ verifyToken: "secreto", appSecret: APP_SECRET, handleInbound, adapter }),
    );
    return app;
  }

  async function startRouter(notifier: AgentNotifier | undefined) {
    const app = createApp(notifier);
    const server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("sin puerto");
    return { server, url: `http://127.0.0.1:${address.port}/webhooks/whatsapp` };
  }

  it("notifica la escalación cuando queda en WAITING_AGENT", async () => {
    const notify = vi.fn().mockResolvedValue([{ channel: "webhook", status: "sent", detail: "ok" }]);
    const { server, url } = await startRouter({ notify });
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-hub-signature-256": sign(JSON.stringify(payload)) },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(200);
      expect(notify).toHaveBeenCalledTimes(1);
      const call = notify.mock.calls[0];
      expect(call).toBeDefined();
      const escalation = call![0] as { conversationId: string; lastCustomerMessage: string };
      expect(escalation.conversationId).toBe("c1");
      expect(escalation.lastCustomerMessage).toBe("agente");
    } finally {
      server.close();
    }
  }, 10000);

  it("responde 200 sin notificar si no hay notificador", async () => {
    const { server, url } = await startRouter(undefined);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-hub-signature-256": sign(JSON.stringify(payload)) },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(200);
    } finally {
      server.close();
    }
  }, 10000);

  describe("firma X-Hub-Signature-256", () => {
    const body = JSON.stringify(payload);
    const post = (url: string, headers: Record<string, string>, b: string) =>
      fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: b });

    it("firma válida -> 200", async () => {
      const { server, url } = await startRouter(undefined);
      try {
        expect((await post(url, { "x-hub-signature-256": sign(body) }, body)).status).toBe(200);
      } finally {
        server.close();
      }
    });

    it("firma inválida -> 401", async () => {
      const { server, url } = await startRouter(undefined);
      try {
        const res = await post(url, { "x-hub-signature-256": sign(body, "otro") }, body);
        expect(res.status).toBe(401);
        expect(((await res.json()) as { error: { code: string } }).error.code).toBe("INVALID_SIGNATURE");
      } finally {
        server.close();
      }
    });

    it("sin header -> 401", async () => {
      const { server, url } = await startRouter(undefined);
      try {
        expect((await post(url, {}, body)).status).toBe(401);
      } finally {
        server.close();
      }
    });

    it("cuerpo alterado -> 401", async () => {
      const { server, url } = await startRouter(undefined);
      try {
        const res = await post(url, { "x-hub-signature-256": sign(body) }, body.replace("agente", "otra"));
        expect(res.status).toBe(401);
      } finally {
        server.close();
      }
    });

    it("el GET de verificación sigue funcionando", async () => {
      const { server, url } = await startRouter(undefined);
      try {
        const res = await fetch(`${url}?hub.mode=subscribe&hub.verify_token=secreto&hub.challenge=abc`);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("abc");
      } finally {
        server.close();
      }
    });
  });

});