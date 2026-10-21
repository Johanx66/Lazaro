import type { TelegramMenu } from "../../channels/domain/telegram-menu.js";
import type { MenuAction } from "../domain/menu.js";

export interface ProcessIncomingMessageResult {
  conversationId: string;
  reply: string | null;
  handledByBot: boolean;
  status: import("../../modules/conversations/domain/entities/conversation.js").ConversationStatus;
  /** Menú con teclado inline que el canal debe enviar (solo Telegram). */
  menu?: TelegramMenu;
  /** Acción del menú que eligió el usuario, si eligió alguna. */
  menuAction?: MenuAction;
}

export interface MessageProcessor {
  execute(inbound: import("../../channels/domain/channel-adapter.js").InboundMessage): Promise<ProcessIncomingMessageResult>;
}
