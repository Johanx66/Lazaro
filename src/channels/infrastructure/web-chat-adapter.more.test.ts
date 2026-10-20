import { afterEach, describe, expect, it, vi } from "vitest";
import { WebChatAdapter } from "./web-chat-adapter.js";

const PHONE = "570000000001";
const TTL_MS = 30 * 60 * 1000;

describe("WebChatAdapter outbox", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("TTL: descarta los mensajes vencidos y conserva los vigentes (tiempo simulado)", async () => {
    vi.useFakeTimers();
    const t0 = new Date("2026-01-01T10:00:00.000Z");
    vi.setSystemTime(t0);

    const adapter = new WebChatAdapter();
    await adapter.send(PHONE, { text: "viejo", sender: "BOT" });

    // Justo en el límite del TTL todavía se conserva.
    vi.setSystemTime(new Date(t0.getTime() + TTL_MS));
    await adapter.send(PHONE, { text: "en el límite", sender: "BOT" });

    // 1 ms después del límite, "viejo" ya venció; "en el límite" tiene 1 ms de edad.
    vi.setSystemTime(new Date(t0.getTime() + TTL_MS + 1));
    await adapter.send(PHONE, { text: "nuevo", sender: "AGENT" });

    const { messages } = adapter.poll(PHONE, 0);
    expect(messages.map((m) => m.text)).toEqual(["en el límite", "nuevo"]);
    expect(messages.map((m) => m.sender)).toEqual(["BOT", "AGENT"]);
  });

  it("TTL: si todos los mensajes vencen, el poll no devuelve nada y conserva el cursor", async () => {
    vi.useFakeTimers();
    const t0 = new Date("2026-01-01T10:00:00.000Z");
    vi.setSystemTime(t0);

    const adapter = new WebChatAdapter();
    await adapter.send(PHONE, { text: "a", sender: "BOT" });

    vi.setSystemTime(new Date(t0.getTime() + TTL_MS + 1));
    expect(adapter.poll(PHONE, 0)).toEqual({ messages: [], nextCursor: 0 });
  });

  it("tope: conserva como máximo 200 mensajes por teléfono y descarta los más antiguos", async () => {
    const adapter = new WebChatAdapter();
    for (let i = 0; i < 205; i++) {
      await adapter.send(PHONE, { text: `m${i}`, sender: "BOT" });
    }

    const { messages } = adapter.poll(PHONE, 0);
    expect(messages).toHaveLength(200);
    expect(messages[0]?.text).toBe("m5");
    expect(messages[199]?.text).toBe("m204");
  });

  it("tope: es por teléfono (otro teléfono no se ve afectado)", async () => {
    const adapter = new WebChatAdapter();
    for (let i = 0; i < 205; i++) {
      await adapter.send(PHONE, { text: `m${i}`, sender: "BOT" });
    }
    await adapter.send("570000000002", { text: "otro", sender: "BOT" });

    expect(adapter.poll("570000000002", 0).messages.map((m) => m.text)).toEqual(["otro"]);
  });
});
