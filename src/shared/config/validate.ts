import { parseAllowedOrigins, validateAllowedOrigins } from "./allowed-origins.js";
import { parseFaqMinConfidence } from "./faq-min-confidence.js";
import { isChannelMode, modeIncludesTelegram, modeIncludesWhatsapp, resolveChannelMode, splitChannelTokens } from "./channel-mode.js";

export interface MissingConfigEntry {
  key: string;
  description: string;
}

const DATABASE_URL_ENTRY: MissingConfigEntry = {
  key: "DATABASE_URL",
  description: "URL de conexión a la base de datos",
};

const WHATSAPP_PRODUCTION_ENTRIES: MissingConfigEntry[] = [
  { key: "WHATSAPP_VERIFY_TOKEN", description: "Token de verificación del webhook" },
  { key: "WHATSAPP_ACCESS_TOKEN", description: "Token de acceso a WhatsApp Business Cloud API" },
  { key: "WHATSAPP_PHONE_NUMBER_ID", description: "ID del número de teléfono de WhatsApp" },
];

const WHATSAPP_APP_SECRET_ENTRY: MissingConfigEntry = {
  key: "WHATSAPP_APP_SECRET",
  description: "Secreto de la app de Meta para verificar la firma del webhook",
};

const TELEGRAM_BOT_TOKEN_ENTRY: MissingConfigEntry = {
  key: "TELEGRAM_BOT_TOKEN",
  description: "Token del bot de Telegram (BotFather)",
};

const TELEGRAM_WEBHOOK_SECRET_ENTRY: MissingConfigEntry = {
  key: "TELEGRAM_WEBHOOK_SECRET",
  description: "Secreto del webhook de Telegram (secret_token de setWebhook)",
};

const TELEGRAM_WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

function parsePositiveInt(value: string | undefined): { ok: boolean; value: number; raw: string } {
  const raw = value ?? "";
  if (!value) return { ok: true, value: 3, raw };
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && Number.isInteger(n)
    ? { ok: true, value: n, raw }
    : { ok: false, value: 3, raw };
}

function parsePort(value: string | undefined): { ok: boolean; raw: string } {
  const raw = value ?? "";
  if (!value || !value.trim()) return { ok: true, raw };
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? { ok: true, raw } : { ok: false, raw };
}

function parsePublicBaseUrl(value: string | undefined): { ok: boolean; raw: string } {
  const raw = value ?? "";
  if (!value || !value.trim()) return { ok: true, raw };
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? { ok: true, raw } : { ok: false, raw };
  } catch {
    return { ok: false, raw };
  }
}

function parseBooleanEnv(value: string | undefined): { ok: boolean; raw: string } {
  const raw = value ?? "";
  if (!value || !value.trim()) return { ok: true, raw };
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "false" ? { ok: true, raw } : { ok: false, raw };
}

export function validateConfig(nodeEnv: string = process.env.NODE_ENV ?? "development"): MissingConfigEntry[] {
  const mode = resolveChannelMode(process.env.CHANNEL_MODE, nodeEnv);
  const faq = parseFaqMinConfidence(process.env.FAQ_MIN_CONFIDENCE);
  const transferMisses = parsePositiveInt(process.env.TRANSFER_AFTER_MISSES);
  const loginTtl = parsePositiveInt(process.env.LOGIN_LINK_TTL_MINUTES);
  const sessionIdle = parsePositiveInt(process.env.CHAT_SESSION_IDLE_MINUTES);
  const sessionAbsolute = parsePositiveInt(process.env.CHAT_SESSION_ABSOLUTE_HOURS);
  const publicBaseUrl = parsePublicBaseUrl(process.env.PUBLIC_BASE_URL);
  const requirePhoneMatch = parseBooleanEnv(process.env.REQUIRE_PHONE_MATCH);
  const telegramSkipPhoneMatch = parseBooleanEnv(process.env.TELEGRAM_SKIP_PHONE_MATCH);
  const trustProxy = parseBooleanEnv(process.env.TRUST_PROXY);
  const llmTimeout = parsePositiveInt(process.env.LLM_TIMEOUT_MS);
  const companyQueryTimeout = parsePositiveInt(process.env.COMPANY_QUERY_TIMEOUT_MS);
  const companyMaxRows = parsePositiveInt(process.env.COMPANY_MAX_ROWS);
  const port = parsePort(process.env.PORT);

  const faqIssues: MissingConfigEntry[] = faq.ok
    ? []
    : [
        {
          key: "FAQ_MIN_CONFIDENCE",
          description: `Valor inválido "${faq.raw}". Debe ser un número entre 0 y 1`,
        },
      ];
  const transferIssues: MissingConfigEntry[] = transferMisses.ok
    ? []
    : [
        {
          key: "TRANSFER_AFTER_MISSES",
          description: `Valor inválido "${transferMisses.raw}". Debe ser un entero positivo`,
        },
      ];
  const identityIssues: MissingConfigEntry[] = [
    ...(loginTtl.ok ? [] : [{ key: "LOGIN_LINK_TTL_MINUTES", description: `Valor inválido "${loginTtl.raw}". Debe ser un entero positivo` }]),
    ...(sessionIdle.ok ? [] : [{ key: "CHAT_SESSION_IDLE_MINUTES", description: `Valor inválido "${sessionIdle.raw}". Debe ser un entero positivo` }]),
    ...(sessionAbsolute.ok ? [] : [{ key: "CHAT_SESSION_ABSOLUTE_HOURS", description: `Valor inválido "${sessionAbsolute.raw}". Debe ser un entero positivo` }]),
    ...(publicBaseUrl.ok ? [] : [{ key: "PUBLIC_BASE_URL", description: `Valor inválido "${publicBaseUrl.raw}". Debe ser una URL absoluta http(s)` }]),
    ...(requirePhoneMatch.ok ? [] : [{ key: "REQUIRE_PHONE_MATCH", description: `Valor inválido "${requirePhoneMatch.raw}". Debe ser true o false` }]),
    ...(telegramSkipPhoneMatch.ok
      ? []
      : [{ key: "TELEGRAM_SKIP_PHONE_MATCH", description: `Valor inválido "${telegramSkipPhoneMatch.raw}". Debe ser true o false` }]),
    ...(trustProxy.ok ? [] : [{ key: "TRUST_PROXY", description: `Valor inválido "${trustProxy.raw}". Debe ser true o false` }]),
  ];
  const phase5Issues: MissingConfigEntry[] = [
    ...(llmTimeout.ok ? [] : [{ key: "LLM_TIMEOUT_MS", description: `Valor inválido "${llmTimeout.raw}". Debe ser un entero positivo` }]),
    ...(companyQueryTimeout.ok ? [] : [{ key: "COMPANY_QUERY_TIMEOUT_MS", description: `Valor inválido "${companyQueryTimeout.raw}". Debe ser un entero positivo` }]),
    ...(companyMaxRows.ok ? [] : [{ key: "COMPANY_MAX_ROWS", description: `Valor inválido "${companyMaxRows.raw}". Debe ser un entero positivo` }]),
  ];
  const portIssues: MissingConfigEntry[] = port.ok
    ? []
    : [{ key: "PORT", description: `Valor inválido "${port.raw}". Debe ser un entero entre 1 y 65535` }];

  if (!isChannelMode(mode)) {
    return [
      {
        key: "CHANNEL_MODE",
        description: `Valor inválido "${mode}". Los valores permitidos son: web, whatsapp, telegram, both o una lista separada por comas (ej: whatsapp,telegram)`,
      },
      ...faqIssues,
      ...transferIssues,
      ...identityIssues,
      ...phase5Issues,
      ...portIssues,
    ];
  }

  const originIssues: MissingConfigEntry[] = validateAllowedOrigins(
    parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
    nodeEnv,
  ).map((description) => ({ key: "ALLOWED_ORIGINS", description }));
  const commonIssues = [...faqIssues, ...transferIssues, ...identityIssues, ...phase5Issues, ...portIssues, ...originIssues];
  if (nodeEnv !== "production") return commonIssues;

  // El simulador /dev/chat no se monta en producción: se rechaza cualquier modo con el
  // token literal "web" (ej. "web", "web,telegram"). El alias "both" sigue permitido:
  // en producción equivale a whatsapp (el componente web solo se monta fuera de prod).
  if (splitChannelTokens(mode).includes("web")) {
    return [
      {
        key: "CHANNEL_MODE",
        description:
          'El modo que incluye "web" no es válido en producción: el simulador /dev/chat no se monta en producción. Use "whatsapp", "telegram" o una combinación de ellos',
      },
      ...commonIssues,
    ];
  }

  const required: MissingConfigEntry[] = [DATABASE_URL_ENTRY];
  if (modeIncludesWhatsapp(mode)) {
    required.push(...WHATSAPP_PRODUCTION_ENTRIES, WHATSAPP_APP_SECRET_ENTRY);
  }
  if (modeIncludesTelegram(mode)) {
    required.push(TELEGRAM_BOT_TOKEN_ENTRY, TELEGRAM_WEBHOOK_SECRET_ENTRY);
  }

  const missing = required.filter((entry) => !(process.env[entry.key] ?? "").trim());

  // El secreto del webhook debe ser un token apto para el header
  // X-Telegram-Bot-Api-Secret-Token (letras, dígitos, guion y guion bajo; 1-256).
  const telegramSecret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
  const telegramSecretIssues: MissingConfigEntry[] =
    modeIncludesTelegram(mode) && telegramSecret.length > 0 && !TELEGRAM_WEBHOOK_SECRET_PATTERN.test(telegramSecret)
      ? [
          {
            key: "TELEGRAM_WEBHOOK_SECRET",
            description:
              "Valor inválido. Debe ser de 1 a 256 caracteres: letras, dígitos, '-' o '_' (el formato aceptado por secret_token de Telegram)",
          },
        ]
      : [];

  return [...missing, ...telegramSecretIssues, ...commonIssues];
}
