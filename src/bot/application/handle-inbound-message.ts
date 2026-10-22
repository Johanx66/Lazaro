import type { AgentNotifier } from "../../connectors/domain/agent-notifier.js";
import type { ChannelAdapter } from "../../channels/domain/channel-adapter.js";
import type { InboundMessage } from "../../channels/domain/channel-adapter.js";
import type { MenuChannelAdapter } from "../../channels/domain/telegram-menu.js";
import type { MessageProcessor, ProcessIncomingMessageResult } from "./message-processor.js";

export interface HandleInboundMessageDeps {
  processor: MessageProcessor;
  adapter: ChannelAdapter;
  notifier?: AgentNotifier;
  /**
   * Canal con teclado inline (Telegram). Sin él, el menú no se entrega y el
   * resto del flujo sigue igual.
   */
  menuAdapter?: MenuChannelAdapter;
}

export class HandleInboundMessageUseCase {
  constructor(private readonly deps: HandleInboundMessageDeps) {}

  async execute(inbound: InboundMessage): Promise<ProcessIncomingMessageResult> {
    const result = await this.deps.processor.execute(inbound);
    const handoffMenu = (result.status === "WAITING_AGENT" || result.status === "OPEN") && result.reply
      ? {
          text: result.reply,
          buttons: [[{ label: "🔙 Volver al menú", callbackData: "handoff:back" }]],
        }
      : null;
    if ((result.menu ?? handoffMenu) && this.deps.menuAdapter) {
      // El menú se entrega como mensaje con teclado: no se manda el texto suelto.
      await this.deps.menuAdapter.sendMenu(inbound.contactId, result.menu ?? handoffMenu!).catch((error: unknown) => {
        console.error(
          JSON.stringify({
            level: "warn",
            msg: "no se pudo entregar el menú por el canal",
            to: inbound.contactId,
            channel: this.deps.menuAdapter?.channel,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      });
    } else if (result.reply) {
      await this.deps.adapter.send(inbound.contactId, { text: result.reply, sender: "BOT" }).catch((error: unknown) => {
        console.error(
          JSON.stringify({
            level: "warn",
            msg: "no se pudo entregar la respuesta por el canal",
            to: inbound.contactId,
            channel: this.deps.adapter.channel,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      });
    }
    if (result.status === "WAITING_AGENT" && this.deps.notifier) {
      await this.deps.notifier
        .notify({
          conversationId: result.conversationId,
          userPhone: inbound.contactId,
          userName: inbound.name.length > 0 ? inbound.name : null,
          lastCustomerMessage: inbound.text,
          escalatedAt: new Date(),
        })
        .catch(() => []);
    }
    return result;
  }
}
