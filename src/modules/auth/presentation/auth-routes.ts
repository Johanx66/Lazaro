import { Router } from "express";
import type { RequestHandler } from "express";
import type { AuthController } from "./auth-controller.js";

export function authRoutes(controller: AuthController, loginRateLimit: RequestHandler): Router {
  const router = Router();

  router.post("/login", loginRateLimit, (req, res) => controller.login(req, res));
  router.post("/logout", (req, res) => controller.logout(req, res));
  router.get("/me", (req, res) => controller.me(req, res));

  return router;
}
