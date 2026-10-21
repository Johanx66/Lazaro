import type { TelegramSender } from "../domain/telegram.js";
import { redactLoginLinks } from "../../shared/application/redact-secrets.js";

const TELEGRAM_API_URL = "https://api.telegram.org";

export class HttpTelegramSender implements TelegramSender {
  constructor(private readonly botToken: string) {}

  async sendText(chatId: string, message: string): Promise<void> {
    const response = await fetch(`${TELEGRAM_API_URL}/bot${this.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Telegram API error ${response.status}: ${body}`);
    }
  }
}

export class LogTelegramSender implements TelegramSender {
  async sendText(chatId: string, message: string): Promise<void> {
    console.log(
      // El token de los enlaces de login es una credencial: no se registra.
      JSON.stringify({
        level: "info",
        mock: "telegram",
        chatId,
        message: redactLoginLinks(message),
      }),
    );
  }
}
