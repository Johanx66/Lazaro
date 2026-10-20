import type { BotBrain } from "../domain/brain.js";

export interface BotpressConfig {
  webhookUrl: string;
  secret: string;
}

export class BotpressBrain implements BotBrain {
  constructor(private readonly deps: BotpressConfig) {}

  async answer(query: string): Promise<string | null> {
    if (!this.deps.webhookUrl) {
      return null;
    }
    const response = await fetch(this.deps.webhookUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.deps.secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { reply?: unknown };
    return typeof body.reply === "string" && body.reply.trim().length > 0 ? body.reply : null;
  }
}

export function createBotpressBrain(config: BotpressConfig): BotBrain | null {
  if (!config.secret) {
    console.log(
      JSON.stringify({
        level: "info",
        msg: "botpress en modo MOCK (sin BOTPRESS_WEBHOOK_SECRET)",
      }),
    );
    return null;
  }
  return new BotpressBrain(config);
}