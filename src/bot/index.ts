import type { Express } from "express";
import { buildAgentNotifier } from "../connectors/index.js";
import { connectorSummary } from "../connectors/index.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { env } from "../shared/config/env.js";
import type { StartConversationUseCase } from "../modules/conversations/application/use-cases/start-conversation.js";
import type { SendMessageUseCase } from "../modules/conversations/application/use-cases/send-message.js";
import type { AddBotReplyUseCase } from "../modules/conversations/application/use-cases/add-bot-reply.js";
import type { HandleNonTextEventUseCase } from "../modules/conversations/application/use-cases/handle-non-text-event.js";
import type { TransferToHumanUseCase } from "../modules/conversations/application/use-cases/transfer-to-human.js";
import type { UserRepository } from "../modules/users/domain/repositories/user-repository.js";
import type { WebChatAdapter } from "../channels/infrastructure/web-chat-adapter.js";
import type { WhatsAppAdapter } from "../channels/infrastructure/whatsapp-adapter.js";
import type { TelegramAdapter } from "../channels/infrastructure/telegram-adapter.js";
import { webChatRoutes } from "../channels/presentation/web-chat-routes.js";
import { isChannelMode, modeIncludesTelegram, modeIncludesWeb, modeIncludesWhatsapp } from "../shared/config/channel-mode.js";
import { HandleInboundMessageUseCase } from "./application/handle-inbound-message.js";
import { ProcessIncomingMessageUseCase } from "./application/process-incoming-message.js";
import type {
  ChatIdentityPort,
  IntentClassifierPort,
  DataQueryPort,
} from "./application/process-incoming-message.js";
import { createBotpressBrain } from "./botpress/index.js";
import { CompositeKnowledgeRepository, StaticKnowledgeBase } from "./domain/knowledge.js";
import type { KnowledgeRepository } from "./domain/knowledge.js";
import type { WhatsAppSender } from "./domain/whatsapp.js";
import { PrismaKnowledgeBaseRepository } from "./infrastructure/prisma-knowledge-repository.js";
import { telegramWebhookRouter } from "./presentation/telegram-webhook.js";
import { whatsappWebhookRouter } from "./presentation/whatsapp-webhook.js";

export interface WireBotDeps {
  prisma: PrismaClient;
  env: typeof env;
  userRepository: UserRepository;
  startConversation: StartConversationUseCase;
  sendMessage: SendMessageUseCase;
  addBotReply: AddBotReplyUseCase;
  handleNonTextEvent: HandleNonTextEventUseCase;
  transferToHuman: TransferToHumanUseCase;
  /** Adaptador único del canal web, compartido con el panel de asesor y el notifier. */
  webAdapter: WebChatAdapter;
  /** Adaptador único de WhatsApp (solo cuando el modo de canal lo incluye). */
  whatsappAdapter?: WhatsAppAdapter;
  /** Adaptador único de Telegram (solo cuando el modo de canal lo incluye). */
  telegramAdapter?: TelegramAdapter;
  /** secret_token del webhook de Telegram (mismo valor que en setWebhook). */
  telegramWebhookSecret?: string;
  /** Enviador de WhatsApp, compartido con el notifier de asesores. */
  sender: WhatsAppSender;
  identity?: ChatIdentityPort;
  /** Fase 5: clasificador de intenciones (Ollama). Sin él, se usan palabras clave. */
  classifier?: IntentClassifierPort;
  /** Fase 5: consulta de datos de la empresa. Requerido si hay classifier. */
  dataQuery?: DataQueryPort;
}

export function wireBot(app: Express, deps: WireBotDeps): void {
  const botpressBrain = createBotpressBrain({
    webhookUrl: deps.env.botpressWebhookUrl,
    secret: deps.env.botpressWebhookSecret,
  });

  const knowledgeRepository = new CompositeKnowledgeRepository([
    new StaticKnowledgeBase(deps.env.faqMinConfidence),
    new PrismaKnowledgeBaseRepository(deps.prisma, deps.env.faqMinConfidence),
    ...(botpressBrain
      ? [{ findAnswer: (query) => botpressBrain.answer(query) } satisfies KnowledgeRepository]
      : []),
  ]);

  const processor = new ProcessIncomingMessageUseCase({
    users: {
      findOrCreateUser: async (phone, name, channel) => {
        const existing = await deps.userRepository.findByPhone(phone);
        if (existing) return existing;
        return deps.userRepository.create({
          name: name.trim().length > 0 ? name.trim() : "Cliente",
          phone,
          email: null,
          externalCustomerId: `${channel.toLowerCase()}-${phone}`,
        });
      },
    },
    conversations: {
      startConversation: (input) => deps.startConversation.execute(input),
      sendMessage: (input) => deps.sendMessage.execute(input),
      recordBotReply: (conversationId, content) => deps.addBotReply.execute(conversationId, content),
      handleNonTextEvent: (input) => deps.handleNonTextEvent.execute(input),
      transferToHuman: (input) => deps.transferToHuman.execute(input),
    },
    knowledge: knowledgeRepository,
    transferAfterMisses: deps.env.transferAfterMisses,
    identity: deps.identity,
    classifier: deps.classifier,
    dataQuery: deps.dataQuery,
  });

  const notifier = buildAgentNotifier({
    sender: deps.sender,
    whatsappSupportPhone: deps.env.whatsappSupportPhone,
    notificationWebhookUrl: deps.env.notificationWebhookUrl,
  });

  const channelMode = deps.env.channelMode;
  if (!isChannelMode(channelMode)) {
    throw new Error(`CHANNEL_MODE inválido: "${channelMode}". Valores permitidos: web, whatsapp, telegram, both o lista con comas`);
  }

  if (modeIncludesWhatsapp(channelMode)) {
    const waAdapter = deps.whatsappAdapter;
    if (!waAdapter) {
      throw new Error("CHANNEL_MODE incluye WhatsApp pero no se proporcionó whatsappAdapter");
    }
    app.use(
      "/webhooks/whatsapp",
      whatsappWebhookRouter({
        verifyToken: deps.env.whatsappVerifyToken,
        appSecret: deps.env.whatsappAppSecret,
        adapter: waAdapter,
        handleInbound: new HandleInboundMessageUseCase({ processor, adapter: waAdapter, notifier }),
      }),
    );
  }

  if (modeIncludesTelegram(channelMode)) {
    const tgAdapter = deps.telegramAdapter;
    if (!tgAdapter) {
      throw new Error("CHANNEL_MODE incluye Telegram pero no se proporcionó telegramAdapter");
    }
    app.use(
      "/webhooks/telegram",
      telegramWebhookRouter({
        secretToken: deps.telegramWebhookSecret ?? "",
        adapter: tgAdapter,
        handleInbound: new HandleInboundMessageUseCase({ processor, adapter: tgAdapter, notifier }),
      }),
    );
  }

  // El simulador solo existe fuera de producción (validateConfig además rechaza web en producción).
  if (modeIncludesWeb(channelMode) && deps.env.nodeEnv !== "production") {
    const webAdapter = deps.webAdapter;
    app.use(
      "/dev/chat",
      webChatRoutes({
        adapter: webAdapter,
        handleInbound: new HandleInboundMessageUseCase({ processor, adapter: webAdapter, notifier }),
      }),
    );
  }

  const connectors = connectorSummary({
    sender: deps.sender,
    whatsappSupportPhone: deps.env.whatsappSupportPhone,
    notificationWebhookUrl: deps.env.notificationWebhookUrl,
  });

  console.log(
    JSON.stringify({
      level: "info",
      msg: "bot conectado",
      whatsapp: deps.env.whatsappAccessToken ? "real" : "mock",
      telegram: deps.telegramAdapter ? (deps.env.telegramBotToken ? "real" : "mock") : "off",
      botpress: botpressBrain ? "real" : "mock",
      connectors,
    }),
  );
}