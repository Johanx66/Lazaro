import type { ChannelAdapter, ChannelName, OutboundMessage } from "../domain/channel-adapter.js";
import { isTestPhone } from "../domain/test-phones.js";

export interface StoredOutboundMessage extends OutboundMessage {
  id: number;
  at: Date;
}

const MAX_MESSAGES_PER_PHONE = 200;
const TTL_MS = 30 * 60 * 1000; // 30 minutos

// Nota: almacenamiento en memoria, solo para desarrollo/simulación, una sola instancia.
// El outbox es interno de este adaptador. Ningún otro módulo debe importarlo ni leerlo directamente.
// Todo envío pasa por adapter.send y todo polling por adapter.poll.
export class WebChatAdapter implements ChannelAdapter {
  readonly channel: ChannelName = "WEB";

  private readonly outbox = new Map<string, StoredOutboundMessage[]>();
  private nextId = 1;

  parseInbound(payload: unknown): import("../domain/channel-adapter.js").InboundMessage | null {
    if (!payload || typeof payload !== "object") return null;
    const body = payload as Record<string, unknown>;
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const name = typeof body.name === "string" ? body.name : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (phone.length === 0 || text.length === 0) return null;
    if (!isTestPhone(phone)) return null;
    return { channel: this.channel, contactId: phone, name, text };
  }

  async send(contactId: string, message: OutboundMessage): Promise<void> {
    if (!isTestPhone(contactId)) return;
    const now = new Date();
    const entry = { id: this.nextId++, text: message.text, sender: message.sender, at: now };
    let queue = this.outbox.get(contactId);
    if (!queue) {
      queue = [];
      this.outbox.set(contactId, queue);
    }
    queue.push(entry);
    this.prune(contactId);
  }

  poll(phone: string, afterId: number): { messages: Array<StoredOutboundMessage>; nextCursor: number } {
    if (!isTestPhone(phone)) {
      return { messages: [], nextCursor: afterId };
    }
    let queue = this.outbox.get(phone);
    if (!queue || queue.length === 0) {
      return { messages: [], nextCursor: afterId };
    }
    this.prune(phone);
    queue = this.outbox.get(phone);
    if (!queue || queue.length === 0) {
      return { messages: [], nextCursor: afterId };
    }
    const filtered = queue.filter((m) => m.id > afterId);
    // Descartar los mensajes con id <= afterId en este momento (cursor como confirmación)
    const remaining = queue.filter((m) => m.id > afterId);
    this.outbox.set(phone, remaining);
    const nextCursor = remaining.length > 0 ? Math.max(...remaining.map((m) => m.id)) : afterId;
    return { messages: filtered, nextCursor };
  }

  private prune(phone: string): void {
    const queue = this.outbox.get(phone);
    if (!queue) return;
    const now = Date.now();
    const filtered = queue.filter((m) => now - m.at.getTime() <= TTL_MS);
    if (filtered.length > MAX_MESSAGES_PER_PHONE) {
      // mantener últimos N
      const pruned = filtered.slice(filtered.length - MAX_MESSAGES_PER_PHONE);
      this.outbox.set(phone, pruned);
      return;
    }
    this.outbox.set(phone, filtered);
  }
}