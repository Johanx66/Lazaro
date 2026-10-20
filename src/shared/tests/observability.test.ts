import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import { rateLimit } from "../http/rate-limit.js";
import { requestLogger } from "../http/request-logger.js";
import { validateConfig } from "../config/validate.js";

async function startApp(middleware: (app: import("express").Express) => void): Promise<{ server: Server; url: string }> {
  const app = express();
  app.use(express.json());
  middleware(app);
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("sin puerto");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

afterEach(async () => {});

describe("requestLogger", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("registra el request como JSON con requestId, método, ruta y status", async () => {
    const { server, url } = await startApp((app) => {
      app.use(requestLogger());
      app.get("/ping", (_req, res) => res.json({ ok: true }));
    });
    try {
      const res = await fetch(`${url}/ping`);
      expect(res.status).toBe(200);
      const requestId = res.headers.get("x-request-id");
      expect(requestId).toBeTruthy();

      const logCall = logSpy.mock.calls[0][0] as string;
      const log = JSON.parse(logCall) as {
        msg: string;
        requestId: string;
        method: string;
        path: string;
        status: number;
        durationMs?: number;
      };
      expect(log.msg).toBe("request");
      expect(log.requestId).toBe(requestId);
      expect(log.method).toBe("GET");
      expect(log.path).toBe("/ping");
      expect(log.status).toBe(200);
      expect(typeof log.durationMs).toBe("number");
    } finally {
      server.close();
    }
  }, 10000);
});

describe("rateLimit", () => {
  it("devuelve 429 al superar el límite en la ventana y 200 tras esperar", async () => {
    const { server, url } = await startApp((app) => {
      app.use(rateLimit({ windowMs: 300, max: 2 }));
      app.get("/x", (_req, res) => res.json({ ok: true }));
    });
    try {
      const first = await fetch(`${url}/x`);
      const second = await fetch(`${url}/x`);
      const third = await fetch(`${url}/x`);
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(third.status).toBe(429);

      const body = (await third.json()) as { error: { code: string } };
      expect(body.error.code).toBe("TOO_MANY_REQUESTS");

      await new Promise((resolve) => setTimeout(resolve, 350));
      const afterWindow = await fetch(`${url}/x`);
      expect(afterWindow.status).toBe(200);
    } finally {
      server.close();
    }
  }, 10000);
});

describe("validateConfig", () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it("no exige variable alguna fuera de producción", () => {
    expect(validateConfig("development")).toEqual([]);
  });

  it("reporta las variables críticas que faltan en producción", () => {
    delete process.env.DATABASE_URL;
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_APP_SECRET;
    const missing = validateConfig("production");
    expect(missing.map((entry) => entry.key).sort()).toEqual([
      "DATABASE_URL",
      "WHATSAPP_ACCESS_TOKEN",
      "WHATSAPP_APP_SECRET",
      "WHATSAPP_PHONE_NUMBER_ID",
      "WHATSAPP_VERIFY_TOKEN",
    ]);
  });

  it("acepta la configuración completa en producción", () => {
    process.env.DATABASE_URL = "postgresql://u:p@h:5432/db?schema=public";
    process.env.WHATSAPP_VERIFY_TOKEN = "t";
    process.env.WHATSAPP_ACCESS_TOKEN = "t";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1";
    process.env.WHATSAPP_APP_SECRET = "s";
    expect(validateConfig("production")).toEqual([]);
  });

  it("en producción con whatsapp o both exige WHATSAPP_APP_SECRET", () => {
    process.env.DATABASE_URL = "postgresql://u:p@h:5432/db?schema=public";
    process.env.WHATSAPP_VERIFY_TOKEN = "t";
    process.env.WHATSAPP_ACCESS_TOKEN = "t";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1";
    delete process.env.WHATSAPP_APP_SECRET;
    for (const mode of ["whatsapp", "both"]) {
      process.env.CHANNEL_MODE = mode;
      expect(validateConfig("production").map((e) => e.key)).toEqual(["WHATSAPP_APP_SECRET"]);
    }
  });
});