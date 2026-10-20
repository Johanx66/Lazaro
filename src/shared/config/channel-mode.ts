export type ChannelToken = "web" | "whatsapp" | "telegram";

/**
 * Modo de canales activos. Acepta un token suelto ("web", "whatsapp", "telegram"),
 * el alias "both" (web + whatsapp) o una lista separada por comas ("web,telegram").
 * El valor efectivo se normaliza en minúsculas y sin espacios alrededor de las comas.
 */
export type ChannelMode = string;

export const CHANNEL_TOKENS: readonly ChannelToken[] = ["web", "whatsapp", "telegram"];

/** Valores completos aceptados (tokens y alias) para mensajes de error. */
export const CHANNEL_MODES: readonly string[] = ["web", "whatsapp", "telegram", "both"];

function splitTokens(mode: string): string[] {
  return mode
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
}

/** Tokens literales de un modo (sin expandir el alias "both"), en minúsculas. */
export function splitChannelTokens(mode: string): string[] {
  return splitTokens(mode);
}

export function isChannelMode(value: string): boolean {
  const tokens = splitTokens(value);
  if (tokens.length === 0) return false;
  // "both" es un alias completo: no se mezcla con otros tokens.
  if (tokens.includes("both")) return tokens.length === 1;
  return tokens.every((token) => (CHANNEL_TOKENS as readonly string[]).includes(token));
}

/** Valor efectivo: "both" en desarrollo y "whatsapp" en producción si no se define (o viene vacío). */
export function resolveChannelMode(raw: string | undefined, nodeEnv: string): ChannelMode {
  const fallback = nodeEnv === "production" ? "whatsapp" : "both";
  const trimmed = (raw ?? "").trim().toLowerCase();
  return trimmed.length > 0 ? splitTokens(trimmed).join(",") : fallback;
}

function tokens(mode: string): Set<string> {
  const set = new Set<string>();
  for (const token of splitTokens(mode)) {
    if (token === "both") {
      set.add("web");
      set.add("whatsapp");
    } else {
      set.add(token);
    }
  }
  return set;
}

export function modeIncludesWeb(mode: string): boolean {
  return tokens(mode).has("web");
}

export function modeIncludesWhatsapp(mode: string): boolean {
  return tokens(mode).has("whatsapp");
}

export function modeIncludesTelegram(mode: string): boolean {
  return tokens(mode).has("telegram");
}
