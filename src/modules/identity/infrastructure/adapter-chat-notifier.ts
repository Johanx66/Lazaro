import type { ChannelAdapter } from "../../../channels/domain/channel-adapter.js";
import type { ChatNotifier } from "../domain/notifier.js";

/** Envía avisos de identidad por el canal usando los adaptadores existentes. */
export class AdapterChatNotifier implements ChatNotifier {
  constructor(private readonly adapters: Partial<Record<string, ChannelAdapter>>) {}

  async send(channel: string, contactId: string, text: string): Promise<void> {
    const adapter = this.adapters[channel];
    if (!adapter) return;
    try {
      await adapter.send(contactId, { text, sender: "BOT" });
    } catch {
      // Un aviso fallido no debe romper el login.
    }
  }
}
