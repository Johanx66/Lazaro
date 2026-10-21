import type { TelegramMenu } from "../../channels/domain/telegram-menu.js";

export interface TelegramSender {
  sendText(chatId: string, message: string): Promise<void>;
}

/**
 * Transporte de las operaciones de menú de Telegram (teclado inline y callbacks).
 * Es un puerto aparte de `TelegramSender` porque el menú necesita respuestas de
 * la API (message_id) que un envío de texto no devuelve.
 */
export interface TelegramMenuSender {
  sendMenu(chatId: string, menu: TelegramMenu): Promise<void>;
  editMenu(chatId: string, messageId: number, menu: TelegramMenu): Promise<void>;
  answerCallbackQuery(chatId: string, callbackId: string): Promise<void>;
}
