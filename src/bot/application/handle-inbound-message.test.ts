import { describe, expect, it, vi } from "vitest";
import type { ProcessIncomingMessageResult } from "./process-incoming-message.js";
import { HandleInboundMessageUseCase } from "./handle-inbound-message.js";

const baseResult: ProcessIncomingMessageResult = {
  conversationId: "c1", reply: "Respuesta del bot", handledByBot: true, status: "WAITING_USER",
};

function build(result: ProcessIncomingMessageResult) {
  const sendMenu = vi.fn(async () => undefined);
  const send = vi.fn(async () => undefined);
  const processor = { execute: async () => result };
  const useCase = new HandleInboundMessageUseCase({
    processor,
    adapter: { channel: "TELEGRAM", send } as never,
    menuAdapter: { channel: "TELEGRAM", sendMenu, editMenu: vi.fn(), answerCallbackQuery: vi.fn() },
  });
  return { useCase, sendMenu, send };
}

describe("teclado de salida para respuestas Telegram", () => {
  it("agrega Volver al menú a una respuesta normal del bot", async () => {
    const { useCase, sendMenu, send } = build(baseResult);
    await useCase.execute({ channel: "TELEGRAM", contactId: "tg-1", name: "Ana", text: "hola" });

    expect(sendMenu).toHaveBeenCalledWith("tg-1", expect.objectContaining({
      text: "Respuesta del bot",
      buttons: [[expect.objectContaining({ label: "🔙 Volver al menú", callbackData: "menu:home" })]],
    }));
    expect(send).not.toHaveBeenCalled();
  });

  it("conserva Volver al menú y los botones existentes de una pantalla", async () => {
    const { useCase, sendMenu } = build({
      ...baseResult,
      menu: { text: "Tema", buttons: [[{ label: "Volver", callbackData: "pqrs:area:pedidos" }]] },
    });
    await useCase.execute({ channel: "TELEGRAM", contactId: "tg-1", name: "Ana", text: "hola" });
    const sent = sendMenu.mock.calls[0]?.[1];
    expect(sent?.buttons.flat().map(({ callbackData }) => callbackData)).toEqual(["pqrs:area:pedidos", "menu:home"]);
  });

  it("no agrega controles cuando un asesor ya tiene la conversación OPEN", async () => {
    const { useCase, sendMenu, send } = build({ ...baseResult, status: "OPEN" });
    await useCase.execute({ channel: "TELEGRAM", contactId: "tg-1", name: "Ana", text: "hola" });
    expect(sendMenu).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith("tg-1", { text: "Respuesta del bot", sender: "BOT" });
  });

  it("preserva el botón para cancelar espera y añade el menú independiente", async () => {
    const { useCase, sendMenu } = build({ ...baseResult, status: "WAITING_AGENT" });
    await useCase.execute({ channel: "TELEGRAM", contactId: "tg-1", name: "Ana", text: "hola" });
    const sent = sendMenu.mock.calls[0]?.[1];
    expect(sent?.buttons.flat().map(({ callbackData }) => callbackData)).toEqual(["handoff:back", "menu:home"]);
  });
});
