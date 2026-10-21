import type { ChannelName } from "../../channels/domain/channel-adapter.js";
import type { MenuChannelAdapter } from "../../channels/domain/telegram-menu.js";
import type { ChatMenuNotifier } from "../../modules/identity/domain/notifier.js";
import { buildAttentionMenu } from "../domain/menu.js";

/**
 * Entrega el menú de atención por el canal del contacto verificado. Solo los
 * canales con teclado inline (Telegram) lo reciben; en los demás no se envía
 * nada y el flujo no cambia.
 */
export class AdapterChatMenuNotifier implements ChatMenuNotifier {
  constructor(private readonly adapters: Partial<Record<ChannelName, MenuChannelAdapter>>) {}

  async sendMenu(channel: string, contactId: string): Promise<void> {
    const adapter = this.adapters[channel as ChannelName];
    if (!adapter) return;
    try {
      await adapter.sendMenu(contactId, buildAttentionMenu());
    } catch {
      // Un menú fallido no debe romper el login.
    }
  }
}
