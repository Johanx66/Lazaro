import type { WhatsAppSender } from "../domain/whatsapp.js";

export interface GraphWhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
}

const WHATSAPP_GRAPH_URL = "https://graph.facebook.com/v21.0";

export class GraphWhatsAppSender implements WhatsAppSender {
  constructor(private readonly config: GraphWhatsAppConfig) {}

  async sendText(to: string, message: string): Promise<void> {
    const response = await fetch(
      `${WHATSAPP_GRAPH_URL}/${this.config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: message },
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`WhatsApp API error ${response.status}: ${body}`);
    }
  }

  async sendTemplate(input: { to: string; templateName: string; languageCode: string }): Promise<void> {
    const response = await fetch(
      `${WHATSAPP_GRAPH_URL}/${this.config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: input.to,
          type: "template",
          template: {
            name: input.templateName,
            language: { code: input.languageCode },
          },
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`WhatsApp template error ${response.status}: ${body}`);
    }
  }
}

export class LogWhatsAppSender implements WhatsAppSender {
  async sendText(to: string, message: string): Promise<void> {
    console.log(
      JSON.stringify({ level: "info", mock: "whatsapp", to, message }),
    );
  }

  async sendTemplate(input: { to: string; templateName: string; languageCode: string }): Promise<void> {
    console.log(
      JSON.stringify({ level: "info", mock: "whatsapp", to: input.to, template: input.templateName, language: input.languageCode }),
    );
  }
}