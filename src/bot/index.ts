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
import type { ConversationRepository } from "../modules/conversations/domain/repositories/conversation-repository.js";
import type { TicketRepository } from "../modules/tickets/domain/repositories/ticket-repository.js";
import type { UserRepository } from "../modules/users/domain/repositories/user-repository.js";
import type { WebChatAdapter } from "../channels/infrastructure/web-chat-adapter.js";
import type { WhatsAppAdapter } from "../channels/infrastructure/whatsapp-adapter.js";
import type { TelegramAdapter } from "../channels/infrastructure/telegram-adapter.js";
import type { TelegramMenuAdapter } from "../channels/infrastructure/telegram-menu-adapter.js";
import { buildAttentionMenu } from "./domain/menu.js";
import { HANDOFF_TIMEOUT_NOTICE } from "../shared/config/handoff-messages.js";
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
import { PQRS_CATEGORY_PREFIX } from "./domain/menu.js";
import type { WhatsAppSender } from "./domain/whatsapp.js";
import { PrismaKnowledgeBaseRepository } from "./infrastructure/prisma-knowledge-repository.js";
import type { RagService } from "../modules/rag/rag-service.js";
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
  conversationRepository: ConversationRepository;
  ticketRepository: TicketRepository;
  /** Adaptador único del canal web, compartido con el panel de asesor y el notifier. */
  webAdapter: WebChatAdapter;
  /** Adaptador único de WhatsApp (solo cuando el modo de canal lo incluye). */
  whatsappAdapter?: WhatsAppAdapter;
  /** Adaptador único de Telegram (solo cuando el modo de canal lo incluye). */
  telegramAdapter?: TelegramAdapter;
  /** Adaptador de menú de Telegram (teclado inline). Solo si el modo incluye Telegram. */
  telegramMenuAdapter?: TelegramMenuAdapter;
  /** secret_token del webhook de Telegram (mismo valor que en setWebhook). */
  telegramWebhookSecret?: string;
  /** Enviador de WhatsApp, compartido con el notifier de asesores. */
  sender: WhatsAppSender;
  identity?: ChatIdentityPort;
  /** Fase 5: clasificador de intenciones (Ollama). Sin él, se usan palabras clave. */
  classifier?: IntentClassifierPort;
  /** Fase 5: consulta de datos de la empresa. Requerido si hay classifier. */
  dataQuery?: DataQueryPort;
  rag?: RagService;
  recentMessages?: (conversationId: string, limit: number) => Promise<string[]>;
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

  // Artículos de PQRS: solo los de categoría "PQRS ...". Se consultan únicamente
  // en el modo PQRS del menú, nunca en el flujo general.
  const pqrsKnowledge = new PrismaKnowledgeBaseRepository(deps.prisma, deps.env.faqMinConfidence, {
    categoryPrefix: PQRS_CATEGORY_PREFIX,
  });

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
      handoff: {
        findActiveTicketCreatedAt: async (conversationId) =>
          (await deps.ticketRepository.findOpenByConversationId(conversationId))?.createdAt ?? null,
        hasReminder: async (conversationId, since, reminder) =>
          (await deps.conversationRepository.listMessages(conversationId, { limit: 100 })).some(
            (message) => message.senderType === "BOT" && message.content === reminder && message.createdAt >= since,
          ),
        hasAgentMessage: (conversationId) => deps.conversationRepository.hasAgentMessage(conversationId),
        sendReminder: async (conversationId, reminder) => {
          await deps.conversationRepository.addMessage({ conversationId, senderType: "BOT", content: reminder });
        },
        cancel: async (conversationId) => {
          const ticket = await deps.ticketRepository.findOpenByConversationId(conversationId);
          if (ticket) await deps.ticketRepository.updateStatus(ticket.id, "CLOSED");
          await deps.conversationRepository.update(conversationId, { status: "BOT_HANDLING", assignedAgentId: null });
          await deps.conversationRepository.addMessage({
            conversationId,
            senderType: "SYSTEM",
            content: "Transferencia cancelada; conversación devuelta al bot.",
            metadata: { eventType: "RETURNED_TO_BOT" },
          });
        },
      },
    },
    knowledge: knowledgeRepository,
    pqrsKnowledge,
    rag: deps.rag,
    ragEnabled: deps.env.ragEnabled,
    ragMinScore: deps.env.ragMinScore,
    recentMessages: deps.recentMessages,
    transferAfterMisses: deps.env.transferAfterMisses,
    handoffTimeoutMinutes: deps.env.handoffTimeoutMinutes,
    handoffWaitMessage: deps.env.handoffWaitMessage,
    identity: deps.identity,
    classifier: deps.classifier,
    dataQuery: deps.dataQuery,
  });

  let expiryCheckRunning = false;
  const expireHandoffs = async (): Promise<void> => {
    if (expiryCheckRunning) return;
    expiryCheckRunning = true;
    try {
      const waiting = await deps.conversationRepository.findWaitingForAgent();
      const expiryMs = deps.env.handoffTimeoutMinutes * 60_000;
      for (const conversation of waiting) {
        const ticket = await deps.ticketRepository.findOpenByConversationId(conversation.id);
        if (!ticket || Date.now() - ticket.createdAt.getTime() < expiryMs) continue;
        if (await deps.conversationRepository.hasAgentMessage(conversation.id)) continue;
        await deps.ticketRepository.updateStatus(ticket.id, "CLOSED");
        await deps.conversationRepository.update(conversation.id, { status: "BOT_HANDLING", assignedAgentId: null });
        await deps.conversationRepository.addMessage({
          conversationId: conversation.id,
          senderType: "SYSTEM",
          content: "Transferencia vencida; conversación devuelta al bot.",
          metadata: { eventType: "RETURNED_TO_BOT" },
        });
        const notice = HANDOFF_TIMEOUT_NOTICE;
        await deps.addBotReply.execute(conversation.id, `${notice}\n\n${buildAttentionMenu().text}`);
        const user = await deps.userRepository.findById(conversation.userId);
        const contactId = user?.phone;
        if (!contactId) continue;
        if (conversation.channel === "TELEGRAM" && deps.telegramMenuAdapter) {
          const menu = buildAttentionMenu();
          await deps.telegramMenuAdapter.sendMenu(contactId, {
            text: `${notice}\n\n${menu.text}`,
            buttons: menu.buttons,
          });
        } else if (conversation.channel === "WEB") {
          await deps.webAdapter.send(contactId, { text: `${notice}\n\n${buildAttentionMenu().text}`, sender: "BOT" });
        } else if (conversation.channel === "WHATSAPP" && deps.whatsappAdapter) {
          await deps.whatsappAdapter.send(contactId, { text: `${notice}\n\n${buildAttentionMenu().text}`, sender: "BOT" });
        } else if (conversation.channel === "TELEGRAM" && deps.telegramAdapter) {
          await deps.telegramAdapter.send(contactId, { text: `${notice}\n\n${buildAttentionMenu().text}`, sender: "BOT" });
        }
      }
    } finally {
      expiryCheckRunning = false;
    }
  };
  const handoffExpiryTimer = setInterval(() => { void expireHandoffs().catch(() => undefined); }, 60_000);
  handoffExpiryTimer.unref();
  void expireHandoffs().catch(() => undefined);

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
        handleInbound: new HandleInboundMessageUseCase({
          processor,
          adapter: tgAdapter,
          notifier,
          menuAdapter: deps.telegramMenuAdapter,
        }),
        menuAdapter: deps.telegramMenuAdapter,
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
