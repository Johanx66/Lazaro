import type { ChannelName } from "./channel-adapter.js";

/** Botón de teclado inline de Telegram. */
export interface TelegramInlineButton {
  label: string;
  /**
   * `callback_data` de Telegram: identificador opaco y breve de la acción
   * (Telegram admite 64 bytes). Nunca contiene datos del usuario ni secretos.
   */
  callbackData: string;
}

/** Menú con teclado inline. */
export interface TelegramMenu {
  text: string;
  buttons: TelegramInlineButton[][];
}

/**
 * Capacidad opcional del canal para entregar menús con teclado inline y responder
 * a los callbacks. En esta fase solo Telegram la implementa: el chat web y
 * WhatsApp no cambian.
 */
export interface MenuChannelAdapter {
  readonly channel: ChannelName;
  /** Envía el menú como un mensaje nuevo del bot. */
  sendMenu(contactId: string, menu: TelegramMenu): Promise<void>;
  /** Edita el mensaje del menú (por ejemplo, para quitar el teclado). */
  editMenu(contactId: string, messageId: number, menu: TelegramMenu): Promise<void>;
  /** Confirma el callback para que Telegram deje de mostrar el indicador de carga. */
  answerCallbackQuery(contactId: string, callbackId: string): Promise<void>;
}
