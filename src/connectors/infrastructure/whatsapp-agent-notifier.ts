import type { EscalatedConversation } from "../domain/agent-notifier.js";
import type { WhatsAppSender } from "../../bot/domain/whatsapp.js";
import type { NotificationChannel } from "../application/notify-waiting-agent.js";

export class WhatsAppAgentNotifier implements NotificationChannel {
  readonly name = "whatsapp";

  constructor(
    private readonly sender: WhatsAppSender,
    private readonly supportPhone: string,
  ) {}

  isAvailable(): boolean {
    return this.supportPhone.length > 0;
  }

  async send(conversation: EscalatedConversation): Promise<void> {
    const customer = conversation.userName ?? conversation.userPhone ?? "desconocido";
    const message = [
      `[SOPORTE] Conversación ${conversation.conversationId}`,
      `Cliente: ${customer}`,
      `Último mensaje: ${conversation.lastCustomerMessage}`,
    ].join("\n");
    await this.sender.sendText(this.supportPhone, message);
    console.log(
      JSON.stringify({
        level: "info",
        msg: "escalación notificada a soporte por WhatsApp",
        conversationId: conversation.conversationId,
        supportPhone: this.supportPhone,
      }),
    );
  }
}