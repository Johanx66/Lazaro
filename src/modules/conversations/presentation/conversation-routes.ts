import { Router } from "express";
import type { ConversationController } from "./conversation-controller.js";

export function conversationRoutes(controller: ConversationController): Router {
  const router = Router();

  router.post("/", (req, res) => controller.start(req, res));
  router.get("/:id", (req, res) => controller.getById(req, res));
  router.post("/:id/messages", (req, res) => controller.sendMessage(req, res));
  router.post("/:id/events/handle", (req, res) => controller.handleNonTextEvent(req, res));

  return router;
}