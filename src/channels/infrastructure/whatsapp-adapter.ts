import type { WhatsAppSender } from "../../bot/domain/whatsapp.js";
import type { ChannelAdapter, ChannelName, InboundMessage, OutboundMessage } from "../domain/channel-adapter.js";

interface WhatsAppPayloadShape {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from?: unknown;
          text?: { body?: unknown };
        }>;
        contacts?: Array<{
          profile?: { name?: unknown };
        }>;
      };
    }>;
  }>;
}

export class WhatsAppAdapter implements ChannelAdapter {
  readonly channel: ChannelName = "WHATSAPP";

  constructor(private readonly sender: WhatsAppSender) {}

  parseInbound(payload: unknown): InboundMessage | null {
    if (!payload || typeof payload !== "object") return null;
    const value = (payload as WhatsAppPayloadShape).entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];

    const contactId = typeof message?.from === "string" ? message.from : "";
    const text = typeof message?.text?.body === "string" ? message.text.body.trim() : "";
    if (contactId.length === 0 || text.length === 0) return null;

    const profileName = value?.contacts?.[0]?.profile?.name;
    const name = typeof profileName === "string" ? profileName : "";

    return { channel: this.channel, contactId, name, text };
  }

  async send(contactId: string, message: OutboundMessage): Promise<void> {
    await this.sender.sendText(contactId, message.text);
  }
}
