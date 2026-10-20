import { Router } from "express";
import type { RequestHandler } from "express";
import type { LoginController } from "./login-controller.js";

export function loginRoutes(
  controller: LoginController,
  loginRateLimit: RequestHandler,
  trustedOrigin: RequestHandler,
): Router {
  const router = Router();

  router.get("/login-link/:token", (req, res) => controller.validateLink(req, res));
  router.post("/login", trustedOrigin, loginRateLimit, (req, res) => controller.login(req, res));

  return router;
}
