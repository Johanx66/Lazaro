import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { errorHandler } from "../../../shared/errors/error-handler.js";
import { SESSION_IDLE_TIMEOUT_MS } from "../application/session-policy.js";
import { SessionService } from "../application/session-service.js";
import type { AdminRole, Clock } from "../domain/admin-auth-repository.js";
import { createRequireSession, requireRole } from "../presentation/api-guard.js";
import { InMemoryAdminAuthRepository } from "./in-memory-admin-auth-repository.js";

const EMAIL = "admin@example.com";

class MutableClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

interface Harness {
  repository: InMemoryAdminAuthRepository;
  clock: MutableClock;
  sessions: SessionService;
  base: string;
  server: Server;
}

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

async function startHarness(): Promise<Harness> {
  const repository = new InMemoryAdminAuthRepository();
  const clock = new MutableClock(new Date("2026-01-01T10:00:00.000Z"));
  const sessions = new SessionService({ repository, clock });

  const app = express();
  app.use(express.json());
  // Mismo orden de montaje que main.ts: guard global /api antes de los módulos.
  app.use("/api", createRequireSession(sessions));
  app.use("/api/users", requireRole("ADMIN"));
  app.use("/api/knowledge", requireRole("ADMIN"));
  app.use("/api/conversations", requireRole("ADMIN", "AGENT"));

  const ok = (_req: express.Request, res: express.Response) => {
    res.status(200).json({ ok: true });
  };
  const moduleRoutes = (path: string): void => {
    app.use(
      path,
      express
        .Router()
        .get("/", ok)
        .get("/ejemplo", ok),
    );
  };
  moduleRoutes("/api/users");
  moduleRoutes("/api/knowledge");
  moduleRoutes("/api/conversations");
  // Ruta nueva de ejemplo: por defecto cae bajo la regla "todo /api/* exige sesión".
  moduleRoutes("/api/futuras");

  // Handler que expone lo que dejó el guard de sesión (igual que leería cualquier módulo).
  app.use(
    "/api/principal",
    express.Router().get("/", (req, res) => {
      res.json({ principal: req.principal ?? null });
    }),
  );

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use(errorHandler);

  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  servers.push(server);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { repository, clock, sessions, server, base: `http://127.0.0.1:${port}` };
}

function get(h: Harness, path: string, token?: string): Promise<Response> {
  return fetch(`${h.base}${path}`, {
    headers: token ? { cookie: `chatbot_session=${token}` } : {},
  });
}

async function createSession(h: Harness, role: AdminRole): Promise<{ token: string; adminId: string }> {
  const admin = h.repository.addAdmin({ email: EMAIL, passwordHash: "hash-de-prueba", role });
  const created = await h.sessions.create(admin.id);
  return { token: created.token, adminId: admin.id };
}

async function expectError(res: Response, status: number, code: string): Promise<void> {
  expect(res.status).toBe(status);
  const body = (await res.json()) as { error: { code: string; message: string } };
  expect(typeof body.error.message).toBe("string");
  expect(body.error.code).toBe(code);
}

describe("protección de /api/*", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness();
  });

  it("sin sesión devuelve 401 en una ruta de cada módulo (users, knowledge, conversations y rutas nuevas)", async () => {
    await expectError(await get(h, "/api/users"), 401, "UNAUTHENTICATED");
    await expectError(await get(h, "/api/knowledge"), 401, "UNAUTHENTICATED");
    await expectError(await get(h, "/api/conversations"), 401, "UNAUTHENTICATED");
    await expectError(await get(h, "/api/futuras"), 401, "UNAUTHENTICATED");
  });

  it("con sesión ADMIN devuelve 200 en los tres módulos (rol ADMIN gestiona todo)", async () => {
    const { token } = await createSession(h, "ADMIN");
    expect((await get(h, "/api/users", token)).status).toBe(200);
    expect((await get(h, "/api/knowledge", token)).status).toBe(200);
    expect((await get(h, "/api/conversations", token)).status).toBe(200);
  });

  it("AGENT en /api/knowledge devuelve 403 con formato de error (solo ADMIN)", async () => {
    const { token } = await createSession(h, "AGENT");
    await expectError(await get(h, "/api/knowledge", token), 403, "FORBIDDEN");
  });

  it("AGENT en /api/users devuelve 403 con formato de error (solo ADMIN)", async () => {
    const { token } = await createSession(h, "AGENT");
    await expectError(await get(h, "/api/users", token), 403, "FORBIDDEN");
  });

  it("AGENT en /api/conversations está permitido (atención al cliente)", async () => {
    const { token } = await createSession(h, "AGENT");
    expect((await get(h, "/api/conversations", token)).status).toBe(200);
  });

  it("sesión vencida por inactividad devuelve 401 y se borra de la BD", async () => {
    const { token } = await createSession(h, "ADMIN");
    h.clock.advance(SESSION_IDLE_TIMEOUT_MS);
    await expectError(await get(h, "/api/users", token), 401, "UNAUTHENTICATED");
    expect(h.repository.sessions.size).toBe(0);
  });

  it("token malformado o desconocido devuelve 401", async () => {
    await expectError(await get(h, "/api/users", "x".repeat(43)), 401, "UNAUTHENTICATED");
    await expectError(await get(h, "/api/users", "corto"), 401, "UNAUTHENTICATED");
  });

  it("GET /api/health sigue siendo público sin sesión", async () => {
    const res = await get(h, "/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("POST /api/health (no GET) no está exento y exige sesión", async () => {
    const res = await fetch(`${h.base}/api/health`, { method: "POST" });
    await expectError(res, 401, "UNAUTHENTICATED");
  });

  it("deja el principal (adminId, email, role) disponible para los handlers", async () => {
    const { token, adminId } = await createSession(h, "ADMIN");
    const res = await get(h, "/api/principal", token);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      principal: { adminId, email: EMAIL, role: "ADMIN" },
    });
  });
});