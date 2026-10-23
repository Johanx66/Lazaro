import { createHash, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import type { Request, Response } from "express";
import {
  readTelegramCallback,
  readTelegramUpdateId,
} from "../../channels/infrastructure/telegram-adapter.js";
import type { TelegramAdapter } from "../../channels/infrastructure/telegram-adapter.js";
import type { MenuChannelAdapter } from "../../channels/domain/telegram-menu.js";
import { rateLimit } from "../../shared/http/rate-limit.js";
import type { HandleInboundMessageUseCase } from "../application/handle-inbound-message.js";
import { menuSelectedText } from "../domain/menu.js";

export interface TelegramWebhookDeps {
  /** secret_token configurado en setWebhook. Vacío => el webhook rechaza todo (401). */
  secretToken: string;
  adapter: TelegramAdapter;
  handleInbound: HandleInboundMessageUseCase;
  /**
   * Canal con teclado inline. Sin él, los botones se responden igual pero el
   * menú no se edita.
   */
  menuAdapter?: MenuChannelAdapter;
}

const DEDUPE_TTL_MS = 10 * 60 * 1000; // 10 minutos
const DEDUPE_MAX_ENTRIES = 10_000;
const CHAT_RATE_WINDOW_MS = 60_000;
const CHAT_RATE_MAX = 20;

/**
 * Compara el header con el secreto de forma segura ante longitudes distintas:
 * compara los hashes SHA-256 de ambos valores con timingSafeEqual.
 */
function hasValidSecretToken(secret: string, header: string | undefined): boolean {
  if (!secret || !header) return false;
  const expected = createHash("sha256").update(secret).digest();
  const received = createHash("sha256").update(header).digest();
  return timingSafeEqual(received, expected);
}

/** Caché en memoria de update_id ya procesados (Telegram reintenta ante respuestas no-2xx). */
class UpdateDedupeCache {
  private readonly entries = new Map<number, number>();

  has(updateId: number): boolean {
    const expiresAt = this.entries.get(updateId);
    if (expiresAt === undefined) return false;
    if (expiresAt <= Date.now()) {
      this.entries.delete(updateId);
      return false;
    }
    return true;
  }

  add(updateId: number): void {
    const now = Date.now();
    for (const [id, expiresAt] of this.entries) {
      if (expiresAt <= now) this.entries.delete(id);
    }
    while (this.entries.size >= DEDUPE_MAX_ENTRIES) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
    this.entries.set(updateId, now + DEDUPE_TTL_MS);
  }
}

/** Límite por chat.id: cada mensaje consume IA local y el acceso es abierto. */
class ChatRateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor() {
    setInterval(() => this.cleanup(), CHAT_RATE_WINDOW_MS).unref();
  }

  /** true si el chat está dentro del límite (y cuenta el mensaje). */
  allow(chatId: string): boolean {
    const now = Date.now();
    const entry = this.hits.get(chatId);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(chatId, { count: 1, resetAt: now + CHAT_RATE_WINDOW_MS });
      return true;
    }
    entry.count += 1;
    return entry.count <= CHAT_RATE_MAX;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [chatId, entry] of this.hits) {
      if (entry.resetAt <= now) this.hits.delete(chatId);
    }
  }
}

export function telegramWebhookRouter(deps: TelegramWebhookDeps): Router {
  const router = Router();
  const dedupe = new UpdateDedupeCache();
  const chatLimiter = new ChatRateLimiter();

  router.post(
    "/",
    rateLimit({ windowMs: 60_000, max: 30, message: "Demasiadas solicitudes. Inténtalo más tarde." }),
    async (req: Request, res: Response) => {
      if (!hasValidSecretToken(deps.secretToken, req.get("x-telegram-bot-api-secret-token"))) {
        res.status(401).json({ error: { code: "INVALID_SECRET", message: "Secreto del webhook inválido o ausente" } });
        return;
      }

      const updateId = readTelegramUpdateId(req.body);
      if (updateId !== null && dedupe.has(updateId)) {
        res.status(200).json({ status: "ok" });
        return;
      }

      // Botón del menú pulsado: se responde de inmediato para que Telegram
      // deje de mostrar el indicador de carga, y luego se procesa la acción.
      const callback = readTelegramCallback(req.body);
      if (callback && deps.menuAdapter) {
        await deps.menuAdapter
          .answerCallbackQuery(callback.chatId, callback.id)
          .catch((error: unknown) => {
            console.error(
              JSON.stringify({
                level: "warn",
                msg: "no se pudo confirmar el callback de Telegram",
                chatId: callback.chatId,
                error: error instanceof Error ? error.message : String(error),
              }),
            );
          });
      }

      const inbound = deps.adapter.parseInbound(req.body);
      if (!inbound) {
        // Payload sin texto procesable: se acusa recibo para que Telegram no reintente.
        res.status(200).json({ status: "ok" });
        return;
      }

      if (!chatLimiter.allow(inbound.contactId)) {
        // Límite por chat: se acusa recibo sin consumir IA para evitar reintentos de Telegram.
        res.status(200).json({ status: "ok" });
        return;
      }

      try {
        const result = await deps.handleInbound.execute(inbound);
        // Tras elegir una opción, el mensaje del menú se edita para quitar el
        // teclado y dejar constancia de lo elegido.
        if (callback && callback.messageId !== null && (result.menu || result.menuAction) && deps.menuAdapter) {
          await deps.menuAdapter
            .editMenu(callback.chatId, callback.messageId, result.menu ?? {
              text: menuSelectedText(result.menuAction!),
              buttons: [],
            })
            .catch((error: unknown) => {
              console.error(
                JSON.stringify({
                  level: "warn",
                  msg: "no se pudo editar el menú de Telegram",
                  chatId: callback.chatId,
                  error: error instanceof Error ? error.message : String(error),
                }),
              );
            });
        }
        if (updateId !== null) dedupe.add(updateId);
        res.status(200).json({ status: "ok" });
      } catch (error) {
        console.error(
          JSON.stringify({
            level: "error",
            msg: "error procesando webhook de Telegram",
            error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
          }),
        );
        res.status(500).json({ error: { code: "WEBHOOK_ERROR", message: "No se pudo procesar el mensaje" } });
      }
    },
  );

  return router;
}
