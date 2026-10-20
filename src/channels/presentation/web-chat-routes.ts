import { Router } from "express";
import type { Request, Response } from "express";
import { rateLimit } from "../../shared/http/rate-limit.js";
import { isTestPhone, getTestPhones } from "../domain/test-phones.js";
import type { WebChatAdapter } from "../infrastructure/web-chat-adapter.js";
import type { HandleInboundMessageUseCase } from "../../bot/application/handle-inbound-message.js";

export interface WebChatRoutesDeps {
  adapter: WebChatAdapter;
  handleInbound: HandleInboundMessageUseCase;
}

export function webChatRoutes(deps: WebChatRoutesDeps): Router {
  const router = Router();

  router.get("/test-phones", (_req: Request, res: Response) => {
    res.json({ phones: getTestPhones() });
  });

  router.post(
    "/messages",
    rateLimit({ windowMs: 60_000, max: 30, message: "Demasiadas solicitudes. Inténtalo más tarde." }),
    async (req: Request, res: Response) => {
      const body = req.body as Record<string, unknown>;
      const phone = typeof body.phone === "string" ? body.phone.trim() : "";
      const name = typeof body.name === "string" ? body.name : "";
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (phone.length === 0 || text.length === 0) {
        res
          .status(422)
          .json({ error: { code: "VALIDATION_ERROR", message: "El campo 'phone' y 'text' son obligatorios" } });
        return;
      }
      if (!isTestPhone(phone)) {
        res
          .status(422)
          .json({ error: { code: "VALIDATION_ERROR", message: "Teléfono no permitido. Use un teléfono de prueba" } });
        return;
      }
      const inbound = deps.adapter.parseInbound(req.body);
      if (!inbound) {
        res.status(422).json({ error: { code: "VALIDATION_ERROR", message: "Mensaje inválido" } });
        return;
      }
      await deps.handleInbound.execute(inbound);
      res.status(200).json({ status: "ok" });
    },
  );

  router.get(
    "/messages",
    rateLimit({ windowMs: 60_000, max: 60, message: "Demasiadas solicitudes. Inténtalo más tarde." }),
    (req: Request, res: Response) => {
      const phone = typeof req.query.phone === "string" ? req.query.phone : "";
      const afterIdStr = typeof req.query.afterId === "string" ? req.query.afterId : "0";
      const afterId = Number(afterIdStr);
      if (phone.length === 0 || Number.isNaN(afterId) || afterId < 0) {
        res
          .status(422)
          .json({ error: { code: "VALIDATION_ERROR", message: "Parámetros inválidos" } });
        return;
      }
      if (!isTestPhone(phone)) {
        res
          .status(422)
          .json({ error: { code: "VALIDATION_ERROR", message: "Teléfono no permitido. Use un teléfono de prueba" } });
        return;
      }
      const result = deps.adapter.poll(phone, afterId);
      res.json({ messages: result.messages, nextCursor: result.nextCursor });
    },
  );

  return router;
}