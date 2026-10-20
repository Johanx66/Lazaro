import { Router } from "express";
import type { KnowledgeController } from "./knowledge-controller.js";

export function knowledgeRoutes(controller: KnowledgeController): Router {
  const router = Router();

  router.get("/", (req, res) => controller.list(req, res));
  router.get("/:id", (req, res) => controller.getById(req, res));
  router.post("/", (req, res) => controller.create(req, res));
  router.patch("/:id", (req, res) => controller.update(req, res));

  return router;
}