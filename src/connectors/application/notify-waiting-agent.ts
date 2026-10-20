import type { EscalatedConversation, NotificationChannelResult } from "../domain/agent-notifier.js";

export interface NotificationChannel {
  readonly name: string;
  isAvailable(): boolean;
  send(conversation: EscalatedConversation): Promise<void>;
}

export class NotifyWaitingAgentUseCase {
  constructor(private readonly channels: NotificationChannel[]) {}

  async notify(conversation: EscalatedConversation): Promise<NotificationChannelResult[]> {
    return this.execute(conversation);
  }

  async execute(conversation: EscalatedConversation): Promise<NotificationChannelResult[]> {
    return Promise.all(
      this.channels.map(async (channel) => {
        if (!channel.isAvailable()) {
          return { channel: channel.name, status: "skipped" as const, detail: "conector no configurado" };
        }
        try {
          await channel.send(conversation);
          return { channel: channel.name, status: "sent" as const, detail: "notificación enviada" };
        } catch (error) {
          return {
            channel: channel.name,
            status: "failed" as const,
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
  }
}