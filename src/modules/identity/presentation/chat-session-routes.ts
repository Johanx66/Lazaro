import { Router } from "express";
import type { ChatSessionController } from "./chat-session-controller.js";

export function chatSessionRoutes(controller: ChatSessionController): Router {
  const router = Router();

  router.get("/", (req, res) => controller.list(req, res));
  router.delete("/:id", (req, res) => controller.revoke(req, res));

  return router;
}
