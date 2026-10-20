import type { WhatsAppSender } from "../bot/domain/whatsapp.js";
import type { NotificationChannel } from "./application/notify-waiting-agent.js";
import { NotifyWaitingAgentUseCase } from "./application/notify-waiting-agent.js";
import type { AgentNotifier } from "./domain/agent-notifier.js";
import { WhatsAppAgentNotifier } from "./infrastructure/whatsapp-agent-notifier.js";
import { WebhookPostNotifier } from "./infrastructure/webhook-post-notifier.js";

export interface BuildAgentNotifierDeps {
  sender: WhatsAppSender;
  whatsappSupportPhone: string;
  notificationWebhookUrl: string;
  fetchFn?: typeof fetch;
}

export function buildAgentNotifier(deps: BuildAgentNotifierDeps): AgentNotifier {
  const channels: NotificationChannel[] = [];
  if (deps.whatsappSupportPhone.length > 0) {
    channels.push(new WhatsAppAgentNotifier(deps.sender, deps.whatsappSupportPhone));
  }
  if (deps.notificationWebhookUrl.length > 0) {
    channels.push(new WebhookPostNotifier(deps.notificationWebhookUrl, deps.fetchFn));
  }
  return new NotifyWaitingAgentUseCase(channels);
}

export interface ConnectorSummary {
  whatsapp: boolean;
  webhook: boolean;
}

export function connectorSummary(deps: BuildAgentNotifierDeps): ConnectorSummary {
  return {
    whatsapp: deps.whatsappSupportPhone.length > 0,
    webhook: deps.notificationWebhookUrl.length > 0,
  };
}