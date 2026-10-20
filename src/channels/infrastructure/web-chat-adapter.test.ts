import { describe, expect, it } from "vitest";
import { WebChatAdapter } from "./web-chat-adapter.js";

describe("WebChatAdapter", () => {
  it("parsea mensajes válidos y rechaza otros teléfonos", () => {
    const adapter = new WebChatAdapter();
    const ok = adapter.parseInbound({ phone: "570000000001", name: "Ana", text: "hola" });
    expect(ok).toEqual({
      channel: "WEB",
      contactId: "570000000001",
      name: "Ana",
      text: "hola",
    });
    expect(adapter.parseInbound({ phone: "573143900375", name: "X", text: "hola" })).toBeNull();
    expect(adapter.parseInbound({ phone: "570000000001", name: "X", text: "  " })).toBeNull();
  });

  it("poll devuelve mensajes con id > afterId y descarta los <= afterId", async () => {
    const adapter = new WebChatAdapter();
    await adapter.send("570000000001", { text: "m1", sender: "BOT" });
    await adapter.send("570000000001", { text: "m2", sender: "BOT" });
    await adapter.send("570000000001", { text: "m3", sender: "BOT" });
    const first = adapter.poll("570000000001", 0);
    expect(first.messages.length).toBe(3);
    expect(first.messages[0]!.id).toBe(1);
    expect(first.messages[2]!.id).toBe(3);
    const next = adapter.poll("570000000001", 1); // descarta <=1
    expect(next.messages.length).toBe(2);
    expect(next.messages[0]!.id).toBe(2);
    expect(next.messages[1]!.id).toBe(3);
  });

  it("no entrega duplicados al reconsultar con mismo cursor", async () => {
    const adapter = new WebChatAdapter();
    await adapter.send("570000000001", { text: "a", sender: "BOT" });
    await adapter.send("570000000001", { text: "b", sender: "BOT" });
    const res = adapter.poll("570000000001", 0);
    expect(res.messages.length).toBe(2);
    const again = adapter.poll("570000000001", 2);
    expect(again.messages.length).toBe(0);
    expect(again.nextCursor).toBe(2);
  });
});