import type { EscalatedConversation } from "../domain/agent-notifier.js";
import type { NotificationChannel } from "../application/notify-waiting-agent.js";

export class WebhookPostNotifier implements NotificationChannel {
  readonly name = "webhook";

  constructor(
    private readonly url: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  isAvailable(): boolean {
    return this.url.length > 0;
  }

  async send(conversation: EscalatedConversation): Promise<void> {
    const response = await this.fetchFn(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: "conversation.waiting_agent",
        conversationId: conversation.conversationId,
        customer: {
          phone: conversation.userPhone,
          name: conversation.userName,
        },
        lastCustomerMessage: conversation.lastCustomerMessage,
        escalatedAt: conversation.escalatedAt.toISOString(),
      }),
    });
    if (!response.ok) {
      throw new Error(`El webhook respondió ${response.status}`);
    }
    console.log(
      JSON.stringify({
        level: "info",
        msg: "escalación notificada por webhook",
        conversationId: conversation.conversationId,
        url: this.url,
      }),
    );
  }
}