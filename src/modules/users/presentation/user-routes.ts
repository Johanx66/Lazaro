import { Router } from "express";
import type { UserController } from "./user-controller.js";

export function userRoutes(controller: UserController): Router {
  const router = Router();

  router.post("/", (req, res) => controller.create(req, res));
  router.get("/phone/:phone", (req, res) => controller.getByPhone(req, res));
  router.get("/:id", (req, res) => controller.getById(req, res));
  router.patch("/:id", (req, res) => controller.update(req, res));

  return router;
}