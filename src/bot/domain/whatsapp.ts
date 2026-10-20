export interface WhatsAppSender {
  sendText(to: string, message: string): Promise<void>;
  sendTemplate(input: { to: string; templateName: string; languageCode: string }): Promise<void>;
}