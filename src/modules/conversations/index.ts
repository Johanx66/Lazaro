import type { Express } from "express";
import type { GetConversationUseCase } from "./application/use-cases/get-conversation.js";
import type { HandleNonTextEventUseCase } from "./application/use-cases/handle-non-text-event.js";
import type { SendMessageUseCase } from "./application/use-cases/send-message.js";
import type { StartConversationUseCase } from "./application/use-cases/start-conversation.js";
import type { ConversationRepository } from "./domain/repositories/conversation-repository.js";
import type { ChannelAdapter } from "../../channels/domain/channel-adapter.js";
import type { WhatsAppSender } from "../../bot/domain/whatsapp.js";
import type { UserRepository } from "../users/domain/repositories/user-repository.js";
import { ConversationController } from "./presentation/conversation-controller.js";
import { conversationRoutes } from "./presentation/conversation-routes.js";
import { AgentPanelController } from "./presentation/agent-panel-controller.js";
import { agentPanelRoutes } from "./presentation/agent-panel-routes.js";

export interface WireConversationsDeps {
  startConversation: StartConversationUseCase;
  getConversation: GetConversationUseCase;
  sendMessage: SendMessageUseCase;
  handleNonTextEvent: HandleNonTextEventUseCase;
}

export interface WireAgentPanelDeps {
  conversationRepository: ConversationRepository;
  userRepository: UserRepository;
  webAdapter: ChannelAdapter;
  whatsappAdapter?: ChannelAdapter;
  telegramAdapter?: ChannelAdapter;
  whatsappSender?: WhatsAppSender;
  whatsappTemplateName?: string;
}

export function wireConversations(app: Express, deps: WireConversationsDeps): void {
  const controller = new ConversationController({
    startConversation: deps.startConversation,
    getConversation: deps.getConversation,
    sendMessage: deps.sendMessage,
    handleNonTextEvent: deps.handleNonTextEvent,
  });
  app.use("/api/conversations", conversationRoutes(controller));
}

export function wireAgentPanel(app: Express, deps: WireAgentPanelDeps): void {
  const controller = new AgentPanelController(deps);
  app.use("/api/agent/conversations", agentPanelRoutes(controller));
}