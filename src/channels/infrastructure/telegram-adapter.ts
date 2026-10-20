import type { TelegramSender } from "../../bot/domain/telegram.js";
import type { ChannelAdapter, ChannelName, InboundMessage, OutboundMessage } from "../domain/channel-adapter.js";

interface TelegramUpdateShape {
  update_id?: unknown;
  message?: {
    text?: unknown;
    chat?: {
      id?: unknown;
      type?: unknown;
    };
    from?: {
      first_name?: unknown;
      last_name?: unknown;
    };
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

export class TelegramAdapter implements ChannelAdapter {
  readonly channel: ChannelName = "TELEGRAM";

  constructor(private readonly sender: TelegramSender) {}

  parseInbound(payload: unknown): InboundMessage | null {
    if (!payload || typeof payload !== "object") return null;
    const message = (payload as TelegramUpdateShape).message;
    if (!message || typeof message !== "object") return null;

    const chat = message.chat;
    if (!chat || typeof chat !== "object") return null;
    if (chat.type !== "private") return null;

    const contactId = typeof chat.id === "number" && Number.isFinite(chat.id) ? String(chat.id) : "";
    const text = typeof message.text === "string" ? message.text.trim() : "";
    if (contactId.length === 0 || text.length === 0) return null;

    const firstName = typeof message.from?.first_name === "string" ? message.from.first_name : "";
    const lastName = typeof message.from?.last_name === "string" ? message.from.last_name : "";
    const name = [firstName, lastName].filter((part) => part.length > 0).join(" ");

    return { channel: this.channel, contactId, name, text };
  }

  async send(contactId: string, message: OutboundMessage): Promise<void> {
    for (const chunk of splitTelegramText(message.text)) {
      await this.sender.sendText(contactId, chunk);
    }
  }
}
