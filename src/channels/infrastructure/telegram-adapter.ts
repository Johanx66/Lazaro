import type { TelegramSender } from "../../bot/domain/telegram.js";
import type { ChannelAdapter, ChannelName, InboundMessage, OutboundMessage } from "../domain/channel-adapter.js";

interface TelegramChatShape {
  id?: unknown;
  type?: unknown;
}

interface TelegramUserShape {
  first_name?: unknown;
  last_name?: unknown;
}

interface TelegramUpdateShape {
  update_id?: unknown;
  message?: {
    text?: unknown;
    chat?: TelegramChatShape;
    from?: TelegramUserShape;
  };
  callback_query?: {
    id?: unknown;
    data?: unknown;
    message?: {
      message_id?: unknown;
      chat?: TelegramChatShape;
    };
    from?: TelegramUserShape;
  };
}

/** Máximo de caracteres por mensaje según la Bot API de Telegram. */
export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

/**
 * Trocea un texto en fragmentos de a lo sumo 4096 caracteres Unicode,
 * sin partir emoji ni otros pares sustituto. Devuelve [] si el texto está vacío.
 */
export function splitTelegramText(text: string): string[] {
  if (text.length === 0) return [];
  const characters = Array.from(text);
  if (characters.length <= TELEGRAM_MAX_MESSAGE_LENGTH) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < characters.length; i += TELEGRAM_MAX_MESSAGE_LENGTH) {
    chunks.push(characters.slice(i, i + TELEGRAM_MAX_MESSAGE_LENGTH).join(""));
  }
  return chunks;
}

/** Extrae el update_id de un update de Telegram, o null si no tiene forma válida. */
export function readTelegramUpdateId(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const updateId = (payload as TelegramUpdateShape).update_id;
  return typeof updateId === "number" && Number.isFinite(updateId) ? updateId : null;
}

/** Extrae el chat.id (como string) de un update de Telegram, o null si no tiene forma válida. */
export function readTelegramChatId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const chat = (payload as TelegramUpdateShape).message?.chat;
  if (!chat || typeof chat !== "object") return null;
  return typeof chat.id === "number" && Number.isFinite(chat.id) ? String(chat.id) : null;
}

/** Datos de un callback (botón pulsado) de Telegram. */
export interface TelegramCallback {
  /** Identificador del callback: es lo que se responde con answerCallbackQuery. */
  id: string;
  /** Chat donde está el mensaje con el teclado. */
  chatId: string;
  /** `callback_data` del botón pulsado. */
  data: string;
  /** Mensaje que contiene el teclado; null si el botón no estaba en un mensaje. */
  messageId: number | null;
}

/**
 * Extrae los datos de un `callback_query` de Telegram, o null si el update no
 * es un callback válido (sin id, sin datos o sin chat).
 */
export function readTelegramCallback(payload: unknown): TelegramCallback | null {
  if (!payload || typeof payload !== "object") return null;
  const callback = (payload as TelegramUpdateShape).callback_query;
  if (!callback || typeof callback !== "object") return null;

  const id = typeof callback.id === "string" ? callback.id : "";
  const data = typeof callback.data === "string" ? callback.data : "";
  const chat = callback.message?.chat;
  const chatId =
    chat && typeof chat === "object" && typeof chat.id === "number" && Number.isFinite(chat.id)
      ? String(chat.id)
      : "";
  const messageId =
    typeof callback.message?.message_id === "number" && Number.isFinite(callback.message.message_id)
      ? callback.message.message_id
      : null;

  if (id.length === 0 || data.length === 0 || chatId.length === 0) return null;
  return { id, chatId, data, messageId };
}

export class TelegramAdapter implements ChannelAdapter {
  readonly channel: ChannelName = "TELEGRAM";

  constructor(private readonly sender: TelegramSender) {}

  /**
   * Convierte un update de Telegram en mensaje entrante. Acepta dos formas:
   * - `message` con texto: el cliente escribe.
   * - `callback_query`: el cliente pulsó un botón del menú. El `callback_data`
   *   viaja como texto y el bot lo traduce a la opción elegida.
   */
  parseInbound(payload: unknown): InboundMessage | null {
    if (!payload || typeof payload !== "object") return null;

    const callback = this.parseCallback(payload);
    if (callback) return callback;

    const message = (payload as TelegramUpdateShape).message;
    if (!message || typeof message !== "object") return null;

    const chat = message.chat;
    if (!chat || typeof chat !== "object") return null;
    if (chat.type !== "private") return null;

    const contactId = typeof chat.id === "number" && Number.isFinite(chat.id) ? String(chat.id) : "";
    const text = typeof message.text === "string" ? message.text.trim() : "";
    if (contactId.length === 0 || text.length === 0) return null;

    const name = readTelegramName(message.from);

    return { channel: this.channel, contactId, name, text };
  }

  private parseCallback(payload: object): InboundMessage | null {
    const callback = (payload as TelegramUpdateShape).callback_query;
    if (!callback || typeof callback !== "object") return null;

    const chat = callback.message?.chat;
    if (!chat || typeof chat !== "object") return null;
    if (chat.type !== "private") return null;

    const contactId = typeof chat.id === "number" && Number.isFinite(chat.id) ? String(chat.id) : "";
    const text = typeof callback.data === "string" ? callback.data.trim() : "";
    if (contactId.length === 0 || text.length === 0) return null;

    const name = readTelegramName(callback.from);

    return { channel: this.channel, contactId, name, text };
  }

  async send(contactId: string, message: OutboundMessage): Promise<void> {
    for (const chunk of splitTelegramText(message.text)) {
      await this.sender.sendText(contactId, chunk);
    }
  }
}

function readTelegramName(user: TelegramUserShape | undefined): string {
  const firstName = typeof user?.first_name === "string" ? user.first_name : "";
  const lastName = typeof user?.last_name === "string" ? user.last_name : "";
  return [firstName, lastName].filter((part) => part.length > 0).join(" ");
}
