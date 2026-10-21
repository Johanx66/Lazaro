import { createApp } from "./app.js";
import { bootstrapAdmin } from "./shared/application/bootstrap-admin.js";
import { Argon2PasswordHasher } from "./shared/infrastructure/argon2-password-hasher.js";
import { env } from "./shared/config/env.js";
import { isChannelMode, modeIncludesTelegram, modeIncludesWeb, modeIncludesWhatsapp } from "./shared/config/channel-mode.js";
import { validateConfig } from "./shared/config/validate.js";
import { databaseConfigured, prisma } from "./shared/infrastructure/prisma.js";
import { wireAuth } from "./modules/auth/index.js";
import { createRequireSession, requireRole } from "./modules/auth/presentation/api-guard.js";
import { wireIdentity } from "./modules/identity/index.js";
import { AdapterChatNotifier } from "./modules/identity/infrastructure/adapter-chat-notifier.js";
import { wireBot } from "./bot/index.js";
import { wireConversations, wireAgentPanel } from "./modules/conversations/index.js";
import { wireKnowledge } from "./modules/knowledge/index.js";
import { wireTickets } from "./modules/tickets/index.js";
import { wireAgents } from "./modules/agents/index.js";
import { AddBotReplyUseCase } from "./modules/conversations/application/use-cases/add-bot-reply.js";
import { GetConversationUseCase } from "./modules/conversations/application/use-cases/get-conversation.js";
import { HandleNonTextEventUseCase } from "./modules/conversations/application/use-cases/handle-non-text-event.js";
import { SendMessageUseCase } from "./modules/conversations/application/use-cases/send-message.js";
import { StartConversationUseCase } from "./modules/conversations/application/use-cases/start-conversation.js";
import { TransferToHumanUseCase } from "./modules/conversations/application/use-cases/transfer-to-human.js";
import { PrismaConversationRepository } from "./modules/conversations/infrastructure/prisma-conversation-repository.js";
import { wireUsers } from "./modules/users/index.js";
import { PrismaUserRepository } from "./modules/users/infrastructure/prisma-user-repository.js";
import type { WhatsAppSender } from "./bot/domain/whatsapp.js";
import { GraphWhatsAppSender, LogWhatsAppSender } from "./bot/infrastructure/whatsapp-sender.js";
import { WebChatAdapter } from "./channels/infrastructure/web-chat-adapter.js";
import { WhatsAppAdapter } from "./channels/infrastructure/whatsapp-adapter.js";
import { TelegramAdapter } from "./channels/infrastructure/telegram-adapter.js";
import { HttpTelegramSender, LogTelegramSender } from "./bot/infrastructure/telegram-sender.js";
import { IntentClassifier } from "./modules/chatbot/application/intent-classifier.js";
import { QueryDataUseCase } from "./modules/chatbot/application/query-data-use-case.js";
import { OllamaLlmProvider } from "./modules/chatbot/infrastructure/ollama-llm-provider.js";
import { ToolRegistry } from "./modules/chatbot/tools/tool-registry.js";
import { getCustomerBalanceTool } from "./modules/chatbot/tools/customer-balance.tool.js";
import { getOrderStatusTool } from "./modules/chatbot/tools/order-status.tool.js";
import { getRecentOrdersTool } from "./modules/chatbot/tools/recent-orders.tool.js";
import { createCompanyDbPool } from "./shared/infrastructure/company-database.js";

const mockModes = {
  whatsapp: env.whatsappAccessToken.length === 0,
  botpress: env.botpressWebhookSecret.length === 0,
  accounting: true,
  ai: true,
  connectors: {
    whatsapp: env.whatsappSupportPhone.length === 0,
    webhook: env.notificationWebhookUrl.length === 0,
  },
};

const missingConfig = validateConfig();
if (missingConfig.length > 0) {
  console.error(
    JSON.stringify({
      level: "error",
      msg: "configuración inválida o incompleta",
      missing: missingConfig,
    }),
  );
  process.exit(1);
}

if (isChannelMode(env.channelMode) && modeIncludesWhatsapp(env.channelMode) && !env.whatsappAppSecret) {
  console.warn(
    JSON.stringify({
      level: "warn",
      msg: "WHATSAPP_APP_SECRET no configurado: el webhook de WhatsApp rechazará todas las peticiones (401)",
    }),
  );
}

if (modeIncludesTelegram(env.channelMode) && !env.telegramWebhookSecret) {
  console.warn(
    JSON.stringify({
      level: "warn",
      msg: "TELEGRAM_WEBHOOK_SECRET no configurado: el webhook de Telegram rechazará todas las peticiones (401)",
    }),
  );
}

// Arranque opcional: si ADMIN_EMAIL/ADMIN_PASSWORD están definidos y aún no existe
// ningún usuario ADMIN, se crea aquí (tras migrate deploy). Idempotente: si ya hay
// un admin no toca nada. Nunca registra la contraseña.
const adminBootstrap = databaseConfigured
  ? await bootstrapAdmin(
      prisma,
      new Argon2PasswordHasher(),
      { email: env.adminEmail, password: env.adminPassword },
      (message) => console.log(JSON.stringify({ level: "info", msg: message })),
    )
  : "skipped-missing";
if (databaseConfigured && adminBootstrap === "created") {
  console.log(JSON.stringify({ level: "info", msg: "admin inicial disponible para login" }));
}

const userRepository = new PrismaUserRepository(prisma);
const conversationRepository = new PrismaConversationRepository(prisma);

const startConversation = new StartConversationUseCase({
  repository: conversationRepository,
  findUser: (userId) => userRepository.findById(userId),
});
const getConversation = new GetConversationUseCase(conversationRepository);
const sendMessage = new SendMessageUseCase(conversationRepository);
const addBotReply = new AddBotReplyUseCase(conversationRepository);
const handleNonTextEvent = new HandleNonTextEventUseCase(conversationRepository);

const tickets = wireTickets(prisma);
const agents = wireAgents(prisma);

const sender: WhatsAppSender =
  env.whatsappAccessToken && env.whatsappPhoneNumberId
    ? new GraphWhatsAppSender({
        accessToken: env.whatsappAccessToken,
        phoneNumberId: env.whatsappPhoneNumberId,
      })
    : new LogWhatsAppSender();

const transferToHuman = new TransferToHumanUseCase(
  conversationRepository,
  tickets.createTicket,
  tickets.assignTicket,
  agents.pickAvailableAgent,
);

const webAdapter = new WebChatAdapter();
const whatsappAdapter = modeIncludesWhatsapp(env.channelMode) ? new WhatsAppAdapter(sender) : undefined;

// Telegram: sin token en desarrollo => sender de log (mock); en producción validateConfig
// ya exigió token y secreto si el modo incluye telegram.
const telegramSender = env.telegramBotToken ? new HttpTelegramSender(env.telegramBotToken) : new LogTelegramSender();
const telegramAdapter = modeIncludesTelegram(env.channelMode) ? new TelegramAdapter(telegramSender) : undefined;

// Fase 5: IA local + consultas a la BD de la empresa. Solo se habilita si hay
// COMPANY_DATABASE_URL configurada; en caso contrario el bot usa palabras clave.
type Phase5 = {
  classifier: IntentClassifier;
  dataQuery: QueryDataUseCase;
  companyDbPool: ReturnType<typeof createCompanyDbPool>;
};

const phase5: Phase5 | undefined = env.companyDatabaseUrl
  ? (() => {
      const companyDbPool = createCompanyDbPool(env.companyDatabaseUrl, env.companyQueryTimeoutMs);
      const llmProvider = new OllamaLlmProvider(env.ollamaBaseUrl, env.ollamaModel, env.llmTimeoutMs);
      const toolRegistry = new ToolRegistry();
      toolRegistry.register(getCustomerBalanceTool);
      toolRegistry.register(getOrderStatusTool);
      toolRegistry.register(getRecentOrdersTool);
      return {
        classifier: new IntentClassifier(llmProvider),
        dataQuery: new QueryDataUseCase(llmProvider, toolRegistry, companyDbPool, env.companyMaxRows),
        companyDbPool,
      };
    })()
  : undefined;

const pingDatabase = async (): Promise<boolean> => {
  await prisma.$queryRaw`SELECT 1`;
  return true;
};

const app = createApp(
  (app) => {
    const authSessions = wireAuth(app, prisma, { secureCookies: env.nodeEnv === "production" });
    // Todo /api/* exige sesión (única excepción: GET /api/health). Se monta antes de los
    // módulos para que cualquier ruta nueva bajo /api quede protegida por defecto.
    app.use("/api", createRequireSession(authSessions));
    app.use("/api/users", requireRole("ADMIN"));
    app.use("/api/knowledge", requireRole("ADMIN"));
    app.use("/api/conversations", requireRole("ADMIN", "AGENT"));
    app.use("/api/agent", requireRole("ADMIN", "AGENT"));
    wireUsers(app, prisma);
    wireKnowledge(app, prisma);
    wireConversations(app, {
      startConversation,
      getConversation,
      sendMessage,
      handleNonTextEvent,
    });
    wireAgentPanel(app, {
      conversationRepository,
      userRepository,
      webAdapter,
      whatsappAdapter,
      telegramAdapter,
      whatsappSender: sender,
      whatsappTemplateName: env.whatsappTemplateName || undefined,
    });
    const identity = wireIdentity(app, prisma, {
      publicBaseUrl: env.publicBaseUrl,
      loginLinkTtlMinutes: env.loginLinkTtlMinutes,
      chatSessionIdleMinutes: env.chatSessionIdleMinutes,
      chatSessionAbsoluteHours: env.chatSessionAbsoluteHours,
      requirePhoneMatch: env.requirePhoneMatch,
      skipPhoneMatchForTelegram: env.telegramSkipPhoneMatch,
      trustedOrigins: [...new Set([...env.allowedOrigins, new URL(env.publicBaseUrl).origin])],
      notifier: new AdapterChatNotifier({
        WEB: webAdapter,
        ...(whatsappAdapter ? { WHATSAPP: whatsappAdapter } : {}),
        ...(telegramAdapter ? { TELEGRAM: telegramAdapter } : {}),
      }),
    });
    wireBot(app, {
      prisma,
      env,
      userRepository,
      startConversation,
      sendMessage,
      addBotReply,
      handleNonTextEvent,
      transferToHuman,
      webAdapter,
      whatsappAdapter,
      telegramAdapter,
      telegramWebhookSecret: env.telegramWebhookSecret,
      sender,
      identity: identity.chatIdentity,
      classifier: phase5?.classifier,
      dataQuery: phase5?.dataQuery,
    });
  },
  { pingDatabase: databaseConfigured ? pingDatabase : undefined },
);

const server = app.listen(env.port, "0.0.0.0", () => {
  console.log(
    JSON.stringify({
      level: "info",
      msg: "servidor iniciado",
      port: env.port,
      env: env.nodeEnv,
      databaseConfigured,
      mockModes,
    }),
  );
});

function shutdown(signal: string): void {
  console.log(JSON.stringify({ level: "info", msg: "apagando servidor", signal }));
  server.close(() => {
    prisma
      .$disconnect()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  });
  phase5?.companyDbPool.end().catch(() => undefined);
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));