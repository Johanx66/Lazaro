import type { Express } from "express";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { existsSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./shared/config/env.js";
import { errorHandler } from "./shared/errors/error-handler.js";
import { requestLogger } from "./shared/http/request-logger.js";

export type RawBodyRequest = IncomingMessage & { rawBody?: Buffer };

export type AppConfigurator = (app: Express) => void;

export interface CreateAppOptions {
  pingDatabase?: () => Promise<boolean>;
  /** Orígenes CORS permitidos; por defecto `env.allowedOrigins`. */
  allowedOrigins?: string[];
}

const publicRoot = fileURLToPath(new URL("../public", import.meta.url));
const servesChatPage = existsSync(publicRoot);

export function createApp(configure?: AppConfigurator, options: CreateAppOptions = {}): Express {
  const app = express();

  // Detrás de un proxy inverso, confiar en X-Forwarded-For para que req.ip sea la IP
  // real del cliente (si no, el rate-limit agrupa a todos en la IP del proxy).
  if (env.trustProxy) {
    app.set("trust proxy", true);
  }

  app.use(helmet());
  // CORS solo si hay orígenes configurados; si no, únicamente mismo origen (sin cabeceras CORS).
  const allowedOrigins = options.allowedOrigins ?? env.allowedOrigins;
  if (allowedOrigins.length > 0) {
    const corsMiddleware = cors({
      origin: allowedOrigins,
      credentials: false,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type"],
      optionsSuccessStatus: 204,
    });
    // Un origen no permitido no pasa por `cors`: así no recibe ninguna cabecera Access-Control-*.
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin !== undefined && allowedOrigins.includes(origin)) {
        corsMiddleware(req, res, next);
        return;
      }
      next();
    });
  }
  app.use(
    express.json({
      limit: "1mb",
      verify: (req, _res, buf) => {
        if ((req as IncomingMessage & { originalUrl?: string }).originalUrl?.startsWith("/webhooks/whatsapp")) {
          (req as RawBodyRequest).rawBody = Buffer.from(buf);
        }
      },
    }),
  );
  app.use(requestLogger());

  if (configure) {
    configure(app);
  }

  if (servesChatPage) {
    app.use(express.static(publicRoot));
    // Página pública de login del chat: el enlace la apunta como /login?t=<token>.
    app.get("/login", (_req, res) => {
      res.sendFile(path.join(publicRoot, "login.html"));
    });
  }

  app.get("/api/health", async (_req, res) => {
    let database = "unknown";
    if (options.pingDatabase) {
      database = (await options.pingDatabase().catch(() => false)) ? "connected" : "disconnected";
    }
    res.json({
      status: "ok",
      service: "chatbot-soporte-backend",
      database,
      timestamp: new Date().toISOString(),
    });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Recurso no encontrado" } });
  });

  app.use(errorHandler);

  return app;
}