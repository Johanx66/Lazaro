import { describe, expect, it, vi } from "vitest";
import {
  TELEGRAM_MAX_MESSAGE_LENGTH,
  TelegramAdapter,
  readTelegramChatId,
  readTelegramUpdateId,
  splitTelegramText,
} from "./telegram-adapter.js";
import type { TelegramSender } from "../../bot/domain/telegram.js";

function makeSender() {
  return { sendText: vi.fn().mockResolvedValue(undefined) } satisfies TelegramSender;
}

function privateUpdate(text: string, id = 100): unknown {
  return {
    update_id: id,
    message: {
      text,
      chat: { id: 570123456789, type: "private" },
      from: { first_name: "Ana", last_name: "Torres" },
    },
  };
}

describe("splitTelegramText", () => {
  it("devuelve [] para texto vacío", () => {
    expect(splitTelegramText("")).toEqual([]);
  });

  it("devuelve un solo trozo cuando cabe en 4096 caracteres", () => {
    const text = "a".repeat(TELEGRAM_MAX_MESSAGE_LENGTH);
    expect(splitTelegramText(text)).toEqual([text]);
  });

  it("trocea textos largos en orden respetando el máximo", () => {
    const text = "x".repeat(TELEGRAM_MAX_MESSAGE_LENGTH * 2 + 10);
    const chunks = splitTelegramText(text);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(TELEGRAM_MAX_MESSAGE_LENGTH);
    expect(chunks[1]).toHaveLength(TELEGRAM_MAX_MESSAGE_LENGTH);
    expect(chunks[2]).toHaveLength(10);
    expect(chunks.join("")).toBe(text);
  });

  it("no parte pares sustituto (emoji) al trocear", () => {
    const emoji = "😀"; // 2 code units, 1 code point
    const text = emoji.repeat(TELEGRAM_MAX_MESSAGE_LENGTH); // > 4096 code units
    const chunks = splitTelegramText(text);
    // El troceado es por code points: ningún trozo supera 4096 caracteres Unicode.
    expect(chunks.every((chunk) => Array.from(chunk).length <= TELEGRAM_MAX_MESSAGE_LENGTH)).toBe(true);
    expect(chunks.join("")).toBe(text);
    for (const chunk of chunks) expect(chunk.endsWith("\uFFFD")).toBe(false);
  });
});

describe("readTelegramUpdateId / readTelegramChatId", () => {
  it("extrae el update_id cuando es numérico", () => {
    expect(readTelegramUpdateId({ update_id: 42 })).toBe(42);
  });

  it("devuelve null si no hay update_id válido", () => {
    expect(readTelegramUpdateId(null)).toBeNull();
    expect(readTelegramUpdateId("hola")).toBeNull();
    expect(readTelegramUpdateId({})).toBeNull();
    expect(readTelegramUpdateId({ update_id: "42" })).toBeNull();
    expect(readTelegramUpdateId({ update_id: Number.NaN })).toBeNull();
  });

  it("extrae el chat.id como string", () => {
    expect(readTelegramChatId(privateUpdate("hola"))).toBe("570123456789");
  });

  it("devuelve null si no hay chat.id válido", () => {
    expect(readTelegramChatId(null)).toBeNull();
    expect(readTelegramChatId({})).toBeNull();
    expect(readTelegramChatId({ message: { chat: { id: "123" } } })).toBeNull();
  });
});

describe("TelegramAdapter.parseInbound", () => {
  const adapter = new TelegramAdapter(makeSender());

  it("parsea un mensaje privado con nombre", () => {
    expect(adapter.parseInbound(privateUpdate("hola"))).toEqual({
      channel: "TELEGRAM",
      contactId: "570123456789",
      name: "Ana Torres",
      text: "hola",
    });
  });

  it("descarta chats que no son privados (grupos, canales)", () => {
    const group = {
      update_id: 1,
      message: { text: "hola", chat: { id: -100, type: "group" } },
    };
    expect(adapter.parseInbound(group)).toBeNull();
  });

  it("descarta updates sin texto procesable", () => {
    expect(adapter.parseInbound({ update_id: 1 })).toBeNull();
    expect(adapter.parseInbound(privateUpdate("   "))).toBeNull();
    expect(adapter.parseInbound({ message: { chat: { id: 1, type: "private" } } })).toBeNull();
  });

  it("descarta payloads con forma inválida", () => {
    expect(adapter.parseInbound(null)).toBeNull();
    expect(adapter.parseInbound("basura")).toBeNull();
    expect(adapter.parseInbound({ message: "x" })).toBeNull();
  });

  it("acepta nombre sin apellido", () => {
    const update = {
      update_id: 1,
      message: { text: "hola", chat: { id: 7, type: "private" }, from: { first_name: "Luis" } },
    };
    expect(adapter.parseInbound(update)).toMatchObject({ name: "Luis" });
  });
});

describe("TelegramAdapter.send", () => {
  it("envía el texto directo si cabe en un mensaje", async () => {
    const sender = makeSender();
    const adapter = new TelegramAdapter(sender);
    await adapter.send("570123456789", { text: "respuesta corta", sender: "BOT" });
    expect(sender.sendText).toHaveBeenCalledTimes(1);
    expect(sender.sendText).toHaveBeenCalledWith("570123456789", "respuesta corta");
  });

  it("trocea respuestas largas en orden de envío", async () => {
    const sender = makeSender();
    const adapter = new TelegramAdapter(sender);
    const text = "y".repeat(TELEGRAM_MAX_MESSAGE_LENGTH + 5);
    await adapter.send("570123456789", { text, sender: "AGENT" });
    expect(sender.sendText).toHaveBeenCalledTimes(2);
    const calls = sender.sendText.mock.calls.map((call) => call[1] as string);
    expect(calls[0]).toHaveLength(TELEGRAM_MAX_MESSAGE_LENGTH);
    expect(calls.join("")).toBe(text);
  });

  it("no envía nada si el texto está vacío", async () => {
    const sender = makeSender();
    const adapter = new TelegramAdapter(sender);
    await adapter.send("570123456789", { text: "", sender: "BOT" });
    expect(sender.sendText).not.toHaveBeenCalled();
  });
});
