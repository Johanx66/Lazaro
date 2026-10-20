import { Router } from "express";
import type { AgentPanelController } from "./agent-panel-controller.js";

export function agentPanelRoutes(controller: AgentPanelController): Router {
  const router = Router();

  router.get("/waiting", (req, res) => controller.listWaiting(req, res));
  router.get("/history", (req, res) => controller.listHistory(req, res));
  router.get("/:id/messages", (req, res) => controller.getMessages(req, res));
  router.get("/:id/whatsapp-window", (req, res) => controller.getWhatsAppWindow(req, res));
  router.post("/:id/reply", (req, res) => controller.sendAgentReply(req, res));
  router.post("/:id/send-template", (req, res) => controller.sendTemplate(req, res));
  router.post("/:id/close", (req, res) => controller.closeConversation(req, res));
  router.post("/:id/return-to-bot", (req, res) => controller.returnToBot(req, res));

  return router;
}