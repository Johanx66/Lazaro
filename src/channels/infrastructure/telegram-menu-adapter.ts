import type { TelegramMenuSender } from "../../bot/domain/telegram.js";
import type { ChannelName } from "../domain/channel-adapter.js";
import type { MenuChannelAdapter, TelegramMenu } from "../domain/telegram-menu.js";

/**
 * Canal con menú de Telegram (teclado inline y callbacks). Es una capacidad
 * aparte del `ChannelAdapter` de texto: el chat web y WhatsApp no cambian.
 */
export class TelegramMenuAdapter implements MenuChannelAdapter {
  readonly channel: ChannelName = "TELEGRAM";

  constructor(private readonly sender: TelegramMenuSender) {}

  async sendMenu(contactId: string, menu: TelegramMenu): Promise<void> {
    await this.sender.sendMenu(contactId, menu);
  }

  async editMenu(contactId: string, messageId: number, menu: TelegramMenu): Promise<void> {
    await this.sender.editMenu(contactId, messageId, menu);
  }

  async answerCallbackQuery(contactId: string, callbackId: string): Promise<void> {
    await this.sender.answerCallbackQuery(contactId, callbackId);
  }
}
