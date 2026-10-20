import { createHmac, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import type { Request, Response } from "express";
import type { WhatsAppAdapter } from "../../channels/infrastructure/whatsapp-adapter.js";
import { rateLimit } from "../../shared/http/rate-limit.js";
import type { HandleInboundMessageUseCase } from "../application/handle-inbound-message.js";

export interface WhatsAppWebhookDeps {
  verifyToken: string;
  appSecret: string;
  adapter: WhatsAppAdapter;
  handleInbound: HandleInboundMessageUseCase;
}

function hasValidSignature(secret: string, rawBody: Buffer | undefined, header: string | undefined): boolean {
  if (!secret || !rawBody || !header) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`);
  const received = Buffer.from(header);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function whatsappWebhookRouter(deps: WhatsAppWebhookDeps): Router {
  const router = Router();

  router.get("/", (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === deps.verifyToken && typeof challenge === "string") {
      res.type("text/plain").status(200).send(challenge);
      return;
    }
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Verificación fallida" } });
  });

  router.post(
    "/",
    rateLimit({ windowMs: 60_000, max: 30, message: "Demasiadas solicitudes. Inténtalo más tarde." }),
    async (req: Request, res: Response) => {
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      if (!hasValidSignature(deps.appSecret, rawBody, req.get("x-hub-signature-256"))) {
        res.status(401).json({ error: { code: "INVALID_SIGNATURE", message: "Firma del webhook inválida o ausente" } });
        return;
      }

      const inbound = deps.adapter.parseInbound(req.body);
      if (!inbound) {
        res.status(200).json({ status: "ack" });
        return;
      }

      try {
        await deps.handleInbound.execute(inbound);
        res.status(200).json({ status: "ok" });
      } catch (error) {
        console.error(
          JSON.stringify({
            level: "error",
            msg: "error procesando webhook de WhatsApp",
            error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
          }),
        );
        res.status(500).json({ error: { code: "WEBHOOK_ERROR", message: "No se pudo procesar el mensaje" } });
      }
    },
  );

  return router;
}
