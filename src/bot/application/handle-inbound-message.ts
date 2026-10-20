import type { AgentNotifier } from "../../connectors/domain/agent-notifier.js";
import type { ChannelAdapter } from "../../channels/domain/channel-adapter.js";
import type { InboundMessage } from "../../channels/domain/channel-adapter.js";
import type { MessageProcessor } from "./message-processor.js";

export interface HandleInboundMessageDeps {
  processor: MessageProcessor;
  adapter: ChannelAdapter;
  notifier?: AgentNotifier;
}

export class HandleInboundMessageUseCase {
  constructor(private readonly deps: HandleInboundMessageDeps) {}

  async execute(inbound: InboundMessage): Promise<void> {
    const result = await this.deps.processor.execute(inbound);
    if (result.reply) {
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
  }
}