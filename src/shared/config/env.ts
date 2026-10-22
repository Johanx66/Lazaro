import "dotenv/config";
import { parseAllowedOrigins } from "./allowed-origins.js";
import { resolveChannelMode } from "./channel-mode.js";
import { DEFAULT_FAQ_MIN_CONFIDENCE, parseFaqMinConfidence } from "./faq-min-confidence.js";
import { resolveLlmProvider } from "./llm-provider.js";
import { DEFAULT_COMPANY_CUSTOMER_ID_PATTERN } from "../../modules/identity/domain/customer-code.js";
import { DEFAULT_HANDOFF_WAIT_MESSAGE } from "./handoff-messages.js";
import { isCloudflareEmbeddingsAllowed } from "./cloudflare-embedding-policy.js";

const nodeEnv = process.env.NODE_ENV ?? "development";
const faqMinConfidence = parseFaqMinConfidence(process.env.FAQ_MIN_CONFIDENCE);
const ragMinScoreParsed = Number(process.env.RAG_MIN_SCORE ?? "0.55");
const ragAmbiguityMarginParsed = Number(process.env.RAG_AMBIGUITY_MARGIN ?? "0.04");
const embeddingProvider = process.env.EMBEDDING_PROVIDER === "cloudflare" ? "cloudflare" : "ollama";

const transferAfterMissesRaw = process.env.TRANSFER_AFTER_MISSES ?? "3";
const transferAfterMisses = Number(transferAfterMissesRaw);
const handoffTimeoutRaw = Number(process.env.HANDOFF_TIMEOUT_MINUTES ?? "15");

const publicBaseUrl = (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const loginLinkTtlMinutes = Number(process.env.LOGIN_LINK_TTL_MINUTES ?? "10");
const chatSessionIdleMinutes = Number(process.env.CHAT_SESSION_IDLE_MINUTES ?? "20");
const chatSessionAbsoluteHours = Number(process.env.CHAT_SESSION_ABSOLUTE_HOURS ?? "8");
const requirePhoneMatchRaw = (process.env.REQUIRE_PHONE_MATCH ?? "").trim().toLowerCase();
const requirePhoneMatch = requirePhoneMatchRaw === "" ? nodeEnv === "production" : requirePhoneMatchRaw === "true";
const telegramSkipPhoneMatchRaw = (process.env.TELEGRAM_SKIP_PHONE_MATCH ?? "").trim().toLowerCase();
const telegramSkipPhoneMatch = telegramSkipPhoneMatchRaw === "true";
const trustProxyRaw = (process.env.TRUST_PROXY ?? "").trim().toLowerCase();
const trustProxy = trustProxyRaw === "true" || trustProxyRaw === "1";

function positiveInt(raw: number, fallback: number): number {
  return Number.isInteger(raw) && raw > 0 ? raw : fallback;
}

export const env = {
  nodeEnv,
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
  whatsappAppSecret: process.env.WHATSAPP_APP_SECRET ?? "",
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
  botpressWebhookSecret: process.env.BOTPRESS_WEBHOOK_SECRET ?? "",
  botpressWebhookUrl: process.env.BOTPRESS_WEBHOOK_URL ?? "",
  whatsappSupportPhone: process.env.WHATSAPP_SUPPORT_PHONE ?? "",
  notificationWebhookUrl: process.env.NOTIFICATION_WEBHOOK_URL ?? "",
  // Telegram Bot API (sin credenciales => modo MOCK con log explícito).
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? "",
  // Solo se usan al sembrar el primer admin (prisma/seed.ts). Nunca se registran.
  adminEmail: process.env.ADMIN_EMAIL ?? "",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  // Solo se usan al sembrar un usuario de empresa de ejemplo (prisma/seed.ts). Nunca se registran.
  companySeedUsername: process.env.COMPANY_SEED_USERNAME ?? "",
  companySeedPassword: process.env.COMPANY_SEED_PASSWORD ?? "",
  companySeedDisplayName: process.env.COMPANY_SEED_DISPLAY_NAME ?? "",
  companySeedPhone: process.env.COMPANY_SEED_PHONE ?? "",
  allowedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
  channelMode: resolveChannelMode(process.env.CHANNEL_MODE, nodeEnv),
  // Un valor inválido lo reporta validateConfig; aquí se usa el valor por defecto.
  faqMinConfidence: faqMinConfidence.ok ? faqMinConfidence.value : DEFAULT_FAQ_MIN_CONFIDENCE,
  transferAfterMisses: Number.isFinite(transferAfterMisses) && transferAfterMisses > 0 ? Math.trunc(transferAfterMisses) : 3,
  handoffTimeoutMinutes: Number.isFinite(handoffTimeoutRaw) && handoffTimeoutRaw > 0 ? Math.trunc(handoffTimeoutRaw) : 15,
  handoffWaitMessage: process.env.HANDOFF_WAIT_MESSAGE?.trim() || DEFAULT_HANDOFF_WAIT_MESSAGE,
  whatsappTemplateName: process.env.WHATSAPP_TEMPLATE_NAME ?? "",
  // Base pública absoluta para construir el enlace de login del chat (sin barra final).
  publicBaseUrl,
  loginLinkTtlMinutes: positiveInt(loginLinkTtlMinutes, 10),
  chatSessionIdleMinutes: positiveInt(chatSessionIdleMinutes, 20),
  chatSessionAbsoluteHours: positiveInt(chatSessionAbsoluteHours, 8),
  // Si el contacto del chat debe coincidir con el teléfono registrado del usuario.
  requirePhoneMatch,
  // Si true, se omite esa coincidencia cuando el canal es TELEGRAM (el contactId es
  // un chat.id, no un teléfono). Por defecto false: la coincidencia sigue aplicando.
  telegramSkipPhoneMatch,
  // Confiar en X-Forwarded-For (requerido tras un proxy inverso para que el rate-limit
  // vea la IP real). Vacío/false => no se confía (por defecto).
  trustProxy,

  // FASE 5 — IA local (Ollama). Si no responde, el bot transfiere a asesor.
  ollamaBaseUrl: (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/+$/, ""),
  ollamaModel: process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct",
  llmTimeoutMs: positiveInt(Number(process.env.LLM_TIMEOUT_MS ?? "10000"), 10000),

  // Proveedor de IA: "ollama" (IA local; por defecto y en producción en la empresa)
  // o "cloudflare" (Workers AI; SOLO pruebas con datos ficticios).
  llmProvider: resolveLlmProvider(process.env.LLM_PROVIDER),
  // Credenciales de Cloudflare Workers AI (nunca se registran en logs).
  cloudflareAccountId: (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim(),
  cloudflareApiToken: (process.env.CLOUDFLARE_API_TOKEN ?? "").trim(),
  // Modelo de Workers AI (p. ej. "@cf/meta/llama-3.2-3b-instruct"). Sin valor por
  // defecto: con LLM_PROVIDER=cloudflare es obligatorio.
  llmModel: (process.env.LLM_MODEL ?? "").trim(),

  // FASE 5 — BD de la empresa (solo lectura). Vacío => consultas de datos deshabilitadas.
  companyDatabaseUrl: process.env.COMPANY_DATABASE_URL ?? "",
  companyQueryTimeoutMs: positiveInt(Number(process.env.COMPANY_QUERY_TIMEOUT_MS ?? "3000"), 3000),
  companyMaxRows: positiveInt(Number(process.env.COMPANY_MAX_ROWS ?? "50"), 50),
  // Patrón que debe cumplir el código de cliente de la BD de la empresa para poder
  // vincularlo a un usuario del bot. Vacío => patrón por defecto.
  companyCustomerIdPattern:
    (process.env.COMPANY_CUSTOMER_ID_PATTERN ?? "").trim() || DEFAULT_COMPANY_CUSTOMER_ID_PATTERN,
  ragEnabled: process.env.RAG_ENABLED === "true",
  allowCloudflareEmbeddings: isCloudflareEmbeddingsAllowed(process.env.ALLOW_CLOUDFLARE_EMBEDDINGS),
  embeddingProvider,
  embeddingModel: (process.env.EMBEDDING_MODEL ?? (embeddingProvider === "cloudflare" ? "@cf/baai/bge-m3" : "bge-m3")).trim(),
  ragTopK: positiveInt(Number(process.env.RAG_TOP_K ?? "8"), 8),
  ragMinScore: Number.isFinite(ragMinScoreParsed) && ragMinScoreParsed >= 0 && ragMinScoreParsed <= 1 ? ragMinScoreParsed : 0.55,
  ragAmbiguityMargin: Number.isFinite(ragAmbiguityMarginParsed) && ragAmbiguityMarginParsed >= 0 && ragAmbiguityMarginParsed <= 1 ? ragAmbiguityMarginParsed : 0.04,
  kbImportOnStart: process.env.KB_IMPORT_ON_START === "true",
  companyName: (process.env.COMPANY_NAME ?? "").trim(),
  officialChannel: (process.env.OFFICIAL_CHANNEL ?? "").trim(),
  conditionsUrl: (process.env.CONDITIONS_URL ?? "").trim(),
};
