export interface TelegramSender {
  sendText(chatId: string, message: string): Promise<void>;
}
