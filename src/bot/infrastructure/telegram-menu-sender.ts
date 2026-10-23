import type { TelegramMenu } from "../../channels/domain/telegram-menu.js";
import type { TelegramMenuSender } from "../domain/telegram.js";

const TELEGRAM_API_URL = "https://api.telegram.org";

export class TelegramMenuApiError extends Error {
  constructor(
    readonly status: number,
    readonly description: string,
  ) {
    super(`Telegram API error ${status}: ${description}`);
    this.name = "TelegramMenuApiError";
  }
}

/**
 * Construye el `reply_markup` de la Bot API. Sin botones, el teclado se quita.
 */
function buildReplyMarkup(menu: TelegramMenu): { inline_keyboard: { text: string; callback_data: string }[][] } {
  return {
    inline_keyboard: menu.buttons.map((row) =>
      row.map((button) => ({ text: button.label, callback_data: button.callbackData })),
    ),
  };
}

export class HttpTelegramMenuSender implements TelegramMenuSender {
  constructor(private readonly botToken: string) {}

  async sendMenu(chatId: string, menu: TelegramMenu): Promise<void> {
    await this.call("sendMessage", {
      chat_id: chatId,
      text: menu.text,
      reply_markup: buildReplyMarkup(menu),
    });
  }

  async editMenu(chatId: string, messageId: number, menu: TelegramMenu): Promise<void> {
    await this.call("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: menu.text,
      reply_markup: buildReplyMarkup(menu),
    });
  }

  async answerCallbackQuery(chatId: string, callbackId: string): Promise<void> {
    await this.call("answerCallbackQuery", {
      callback_query_id: callbackId,
      chat_id: chatId,
    });
  }

  /**
   * Llama a un método de la Bot API. El error solo expone el código HTTP y la
   * descripción de Telegram: nunca incluye el token ni el contenido enviado.
   */
  private async call(method: string, payload: Record<string, unknown>): Promise<void> {
    const response = await fetch(`${TELEGRAM_API_URL}/bot${this.botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let description = "Telegram API request failed";
      try {
        const body: unknown = await response.json();
        if (
          body !== null &&
          typeof body === "object" &&
          "description" in body &&
          typeof body.description === "string"
        ) {
          description = body.description;
        }
      } catch {
        // La respuesta no era JSON; se mantiene la descripción genérica.
      }
      throw new TelegramMenuApiError(response.status, description);
    }
  }
}

/**
 * Sender de pruebas: registra la operación sin llamar a Telegram. Solo se
 * registran la acción y el `callback_data` (datos estáticos del menú).
 */
export class LogTelegramMenuSender implements TelegramMenuSender {
  async sendMenu(chatId: string, menu: TelegramMenu): Promise<void> {
    this.log("sendMenu", chatId, menu);
  }

  async editMenu(chatId: string, messageId: number, menu: TelegramMenu): Promise<void> {
    this.log("editMenu", chatId, menu, messageId);
  }

  async answerCallbackQuery(chatId: string, callbackId: string): Promise<void> {
    console.log(
      JSON.stringify({
        level: "info",
        mock: "telegram-menu",
        action: "answerCallbackQuery",
        chatId,
        callbackId,
      }),
    );
  }

  private log(
    action: string,
    chatId: string,
    menu: TelegramMenu,
    messageId?: number,
  ): void {
    console.log(
      JSON.stringify({
        level: "info",
        mock: "telegram-menu",
        action,
        chatId,
        ...(messageId === undefined ? {} : { messageId }),
        buttons: menu.buttons.flat().map((button) => button.callbackData),
      }),
    );
  }
}
