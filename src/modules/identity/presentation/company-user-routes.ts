import { Router } from "express";
import type { CompanyUserController } from "./company-user-controller.js";

export function companyUserRoutes(controller: CompanyUserController): Router {
  const router = Router();

  router.get("/", (req, res) => controller.list(req, res));
  router.post("/", (req, res) => controller.create(req, res));
  router.patch("/:id", (req, res) => controller.update(req, res));

  return router;
}
