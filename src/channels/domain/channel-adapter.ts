export type ChannelName = "WHATSAPP" | "WEB" | "TELEGRAM";

export interface InboundMessage {
  channel: ChannelName;
  contactId: string;
  name: string;
  text: string;
}

export type OutboundSender = "BOT" | "AGENT";

export interface OutboundMessage {
  text: string;
  sender: OutboundSender;
}

export interface ChannelAdapter {
  readonly channel: ChannelName;
  parseInbound(payload: unknown): InboundMessage | null;
  send(contactId: string, message: OutboundMessage): Promise<void>;
}