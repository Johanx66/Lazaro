import { describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import { telegramWebhookRouter } from "./telegram-webhook.js";
import { TelegramAdapter } from "../../channels/infrastructure/telegram-adapter.js";
import type { MenuChannelAdapter } from "../../channels/domain/telegram-menu.js";
import type { HandleInboundMessageUseCase } from "../application/handle-inbound-message.js";
import type { InboundMessage } from "../../channels/domain/channel-adapter.js";
import { TelegramMenuApiError } from "../infrastructure/telegram-menu-sender.js";

const SECRET = "s3creto-del-webhook_de-Telegram";
const SECRET_HEADER = "x-telegram-bot-api-secret-token";

function makeUpdate(text: string, updateId: number, chatId = 570123456789): unknown {
  return {
    update_id: updateId,
    message: { text, chat: { id: chatId, type: "private" }, from: { first_name: "Ana" } },
  };
}

function makeCallbackUpdate(updateId: number): unknown {
  return {
    update_id: updateId,
    callback_query: {
      id: `callback-${updateId}`,
      data: "menu:home",
      from: { first_name: "Ana" },
      message: { message_id: 42, chat: { id: 570123456789, type: "private" } },
    },
  };
}

interface Options {
  secret?: string;
  execute?: (inbound: InboundMessage) => Promise<void>;
  menuAdapter?: MenuChannelAdapter;
}

function makeApp(options: Options = {}) {
  const execute = options.execute ?? vi.fn().mockResolvedValue(undefined);
  const handleInbound = { execute } as unknown as HandleInboundMessageUseCase;
  const sendText = vi.fn().mockResolvedValue(undefined);
  const adapter = new TelegramAdapter({ sendText });

  const app = express();
  app.use(express.json());
  app.use(
    "/webhooks/telegram",
    telegramWebhookRouter({
      secretToken: options.secret ?? SECRET,
      adapter,
      handleInbound,
      ...(options.menuAdapter ? { menuAdapter: options.menuAdapter } : {}),
    }),
  );
  return { app, execute: execute as ReturnType<typeof vi.fn>, sendText };
}

async function start(app: ReturnType<typeof makeApp>["app"]): Promise<{ server: Server; base: string }> {
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("sin puerto");
  return { server, base: `http://127.0.0.1:${addr.port}/webhooks/telegram` };
}

function post(base: string, body: unknown, secret: string | null = SECRET): Promise<Response> {
  return fetch(base, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { [SECRET_HEADER]: secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("telegramWebhookRouter", () => {
  it("trata Message is not modified como normal, sin warn ni mensaje duplicado", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const menu = { text: "Menú", buttons: [[{ label: "PQRS", callbackData: "pqrs:home" }]] };
    const execute = vi.fn().mockResolvedValue({ menu });
    const sendMenu = vi.fn().mockResolvedValue(undefined);
    const editMenu = vi.fn().mockRejectedValue(new TelegramMenuApiError(400, "Bad Request: message is not modified"));
    const { app } = makeApp({
      execute: execute as unknown as (inbound: InboundMessage) => Promise<void>,
      menuAdapter: { channel: "TELEGRAM", sendMenu, editMenu, answerCallbackQuery: vi.fn().mockResolvedValue(undefined) },
    });
    const { server, base } = await start(app);
    try {
      const res = await post(base, makeCallbackUpdate(500));
      expect(res.status, await res.clone().text()).toBe(200);
      expect(editMenu).toHaveBeenCalledOnce();
      expect(sendMenu).not.toHaveBeenCalled();
      expect(consoleSpy).not.toHaveBeenCalled();
    } finally {
      server.close();
      consoleSpy.mockRestore();
    }
  });

  it.each(["Message is too old", "Bad Request: message to edit not found"])(
    "envía el menú como mensaje nuevo cuando la edición falla: %s",
    async (description) => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const menu = { text: "Menú recuperado", buttons: [[{ label: "Volver", callbackData: "menu:home" }]] };
      const execute = vi.fn().mockResolvedValue({ menu });
      const sendMenu = vi.fn().mockResolvedValue(undefined);
      const editMenu = vi.fn().mockRejectedValue(new TelegramMenuApiError(400, description));
      const { app } = makeApp({
        execute: execute as unknown as (inbound: InboundMessage) => Promise<void>,
        menuAdapter: { channel: "TELEGRAM", sendMenu, editMenu, answerCallbackQuery: vi.fn().mockResolvedValue(undefined) },
      });
      const { server, base } = await start(app);
      try {
        const res = await post(base, makeCallbackUpdate(description.length + 600));
        expect(res.status, await res.clone().text()).toBe(200);
        expect(sendMenu).toHaveBeenCalledWith("570123456789", menu);
        const warning = consoleSpy.mock.calls.map(([entry]) => String(entry)).join("\n");
        expect(warning).toContain(description);
        expect(warning).not.toContain("570123456789");
      } finally {
        server.close();
        consoleSpy.mockRestore();
      }
    },
  );

  it("acepta un update válido con el secreto correcto y responde 200", async () => {
    const { app, execute } = makeApp();
    const { server, base } = await start(app);
    try {
      const res = await post(base, makeUpdate("hola", 1));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "ok" });
      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({ channel: "TELEGRAM", contactId: "570123456789", text: "hola" }),
      );
    } finally {
      server.close();
    }
  });

  it("responde 401 sin el header del secreto", async () => {
    const { app, execute } = makeApp();
    const { server, base } = await start(app);
    try {
      const res = await post(base, makeUpdate("hola", 2), null);
      expect(res.status).toBe(401);
      const data = (await res.json()) as { error: { code: string } };
      expect(data.error.code).toBe("INVALID_SECRET");
      expect(execute).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
  });

  it("responde 401 con un secreto incorrecto", async () => {
    const { app, execute } = makeApp();
    const { server, base } = await start(app);
    try {
      const res = await post(base, makeUpdate("hola", 3), "otro-secreto");
      expect(res.status).toBe(401);
      expect(execute).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
  });

  it("con secreto sin configurar rechaza todas las peticiones (401)", async () => {
    const { app, execute } = makeApp({ secret: "" });
    const { server, base } = await start(app);
    try {
      const res = await post(base, makeUpdate("hola", 4), "");
      expect(res.status).toBe(401);
      expect(execute).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
  });

  it("responde 200 sin procesar cuando el payload no tiene texto procesable", async () => {
    const { app, execute } = makeApp();
    const { server, base } = await start(app);
    try {
      const res = await post(base, { update_id: 5 });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "ok" });
      expect(execute).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
  });

  it("responde 200 sin procesar con payload que no es objeto", async () => {
    const { app, execute } = makeApp();
    const { server, base } = await start(app);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "content-type": "text/plain", [SECRET_HEADER]: SECRET },
        body: "no soy un update",
      });
      expect(res.status).toBe(200);
      expect(execute).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
  });

  it("ignora el mismo update_id repetido (dedupe) y responde 200", async () => {
    const { app, execute } = makeApp();
    const { server, base } = await start(app);
    try {
      const first = await post(base, makeUpdate("hola", 10));
      const second = await post(base, makeUpdate("hola", 10));
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(execute).toHaveBeenCalledTimes(1);
    } finally {
      server.close();
    }
  });

  it("si el procesamiento falla avisa al usuario, responde 200 y deduplica el update", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const execute = vi
        .fn()
        .mockRejectedValueOnce(new Error("fallo transitorio"))
        .mockResolvedValueOnce(undefined);
      const sendMenu = vi.fn().mockResolvedValue(undefined);
      const { app, sendText } = makeApp({
        execute: execute as unknown as (inbound: InboundMessage) => Promise<void>,
        menuAdapter: { channel: "TELEGRAM", sendMenu, editMenu: vi.fn(), answerCallbackQuery: vi.fn() },
      });
      const { server, base } = await start(app);
      try {
        const first = await post(base, makeUpdate("hola", 11));
        expect(first.status).toBe(200);
        expect(await first.json()).toEqual({ status: "ok" });
        expect(sendMenu).toHaveBeenCalledWith("570123456789", expect.objectContaining({
          text: expect.stringContaining("ocurrió un problema al procesar tu mensaje"),
          buttons: [[{ label: "🔙 Volver al menú", callbackData: "menu:home" }]],
        }));
        expect(sendText).not.toHaveBeenCalled();

        const retry = await post(base, makeUpdate("hola", 11));
        expect(retry.status).toBe(200);
        expect(execute).toHaveBeenCalledTimes(1);
      } finally {
        server.close();
      }
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("limita a 20 mensajes por minuto por chat: responde 200 sin procesar el excedente", async () => {
    const { app, execute } = makeApp();
    const { server, base } = await start(app);
    try {
      for (let i = 0; i < 20; i += 1) {
        const res = await post(base, makeUpdate(`msg ${i}`, 100 + i));
        expect(res.status).toBe(200);
      }
      expect(execute).toHaveBeenCalledTimes(20);

      const overLimit = await post(base, makeUpdate("msg extra", 999));
      expect(overLimit.status).toBe(200);
      expect(execute).toHaveBeenCalledTimes(20);
    } finally {
      server.close();
    }
  });

  it("limite por chat no afecta a otros chats", async () => {
    const { app, execute } = makeApp();
    const { server, base } = await start(app);
    try {
      for (let i = 0; i < 21; i += 1) {
        await post(base, makeUpdate(`msg ${i}`, 200 + i, 570000000001));
      }
      expect(execute).toHaveBeenCalledTimes(20);

      const otherChat = await post(base, makeUpdate("hola", 500, 570000000002));
      expect(otherChat.status).toBe(200);
      expect(execute).toHaveBeenCalledTimes(21);
    } finally {
      server.close();
    }
  });

  it("aplica el rate limit por IP (30 por minuto) y responde 429 al excederlo", async () => {
    const { app, execute } = makeApp();
    const { server, base } = await start(app);
    try {
      for (let i = 0; i < 30; i += 1) {
        const res = await post(base, makeUpdate(`msg ${i}`, 1000 + i, 570000000003 + i));
        expect(res.status).toBe(200);
      }
      const blocked = await post(base, makeUpdate("demasiado", 9999, 570000000009));
      expect(blocked.status).toBe(429);
    } finally {
      server.close();
    }
  });
});
