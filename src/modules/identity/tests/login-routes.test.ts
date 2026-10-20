import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PasswordHasher } from "../../../shared/domain/password-hasher.js";
import { errorHandler } from "../../../shared/errors/error-handler.js";
import { rateLimit } from "../../../shared/http/rate-limit.js";
import { ChatSessionService } from "../application/chat-session-service.js";
import { LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS } from "../application/policy.js";
import { ChatLoginUseCase } from "../application/use-cases/chat-login.js";
import { GenerateLoginLinkUseCase } from "../application/use-cases/generate-login-link.js";
import { ValidateLoginLinkUseCase } from "../application/use-cases/validate-login-link.js";
import type { Clock } from "../domain/clock.js";
import { LoginController } from "../presentation/login-controller.js";
import { loginRoutes } from "../presentation/login-routes.js";
import { requireTrustedOrigin } from "../presentation/origin-check.js";
import {
  InMemoryAuditWriter,
  InMemoryChatSessionRepository,
  InMemoryCompanyUserRepository,
  InMemoryLoginLinkRepository,
} from "./in-memory-identity-repository.js";

const hasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
};

const MINUTE = 60_000;
const PASSWORD = "contrasena-de-prueba-123";
const ALLOWED_ORIGIN = "https://allowed.example";
const CONTACT = "570000000001";

class FixedClock implements Clock {
  now(): Date {
    return new Date("2026-01-01T10:00:00.000Z");
  }
}

interface Harness {
  base: string;
  users: InMemoryCompanyUserRepository;
  generateLink: () => Promise<string>;
}

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

async function startHarness(): Promise<Harness> {
  const clock = new FixedClock();
  const users = new InMemoryCompanyUserRepository();
  const links = new InMemoryLoginLinkRepository();
  const sessionsRepo = new InMemoryChatSessionRepository(users);
  const audit = new InMemoryAuditWriter();
  const sessions = new ChatSessionService({
    repository: sessionsRepo,
    clock,
    idleMs: 20 * MINUTE,
    absoluteMs: 8 * 60 * MINUTE,
  });
  const generate = new GenerateLoginLinkUseCase({
    repository: links,
    clock,
    ttlMs: 10 * MINUTE,
    publicBaseUrl: "https://app.example",
    audit,
  });
  const validate = new ValidateLoginLinkUseCase({ repository: links, clock });
  const chatLogin = new ChatLoginUseCase({
    companyUsers: users,
    links,
    sessions,
    hasher,
    clock,
    audit,
    notifier: { send: async () => undefined },
    fillerHash: Promise.resolve("hash:relleno"),
    requirePhoneMatch: false,
  });

  const app = express();
  app.use(express.json());
  app.use(
    "/api/identity",
    loginRoutes(
      new LoginController({ validateLink: validate, chatLogin }),
      rateLimit({ windowMs: LOGIN_RATE_LIMIT_WINDOW_MS, max: LOGIN_RATE_LIMIT_MAX }),
      requireTrustedOrigin([ALLOWED_ORIGIN]),
    ),
  );
  app.use(errorHandler);

  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  servers.push(server);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    base: `http://127.0.0.1:${port}`,
    users,
    generateLink: async () => {
      const { url } = await generate.execute({ channel: "WEB", contactId: CONTACT });
      return new URL(url).searchParams.get("t") ?? "";
    },
  };
}

function postLogin(h: Harness, body: unknown, origin?: string): Promise<Response> {
  return fetch(`${h.base}/api/identity/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("API pública de login del chat", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness();
    h.users.addUser({ username: "ana", passwordHash: `hash:${PASSWORD}`, displayName: "Ana" });
  });

  it("GET login-link devuelve el contacto enmascarado", async () => {
    const token = await h.generateLink();
    const res = await fetch(`${h.base}/api/identity/login-link/${token}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ maskedContact: "****0001", channel: "WEB" });
  });

  it("GET login-link con token inválido responde 404 genérico", async () => {
    const res = await fetch(`${h.base}/api/identity/login-link/${"b".repeat(43)}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "INVALID_LINK" } });
  });

  it("POST login correcto responde 200 con nombre y rol", async () => {
    const token = await h.generateLink();
    const res = await postLogin(h, { token, username: "ana", password: PASSWORD }, ALLOWED_ORIGIN);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ displayName: "Ana", role: "USER" });
  });

  it("POST login con contraseña incorrecta responde 401 genérico", async () => {
    const token = await h.generateLink();
    const res = await postLogin(h, { token, username: "ana", password: "equivocada-123" }, ALLOWED_ORIGIN);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("INVALID_CREDENTIALS");
    expect(body.error.message).toBe("No se pudo iniciar sesión");
  });

  it("POST login rechaza un origen no permitido", async () => {
    const token = await h.generateLink();
    const res = await postLogin(
      h,
      { token, username: "ana", password: PASSWORD },
      "https://malicioso.example",
    );
    expect(res.status).toBe(403);
  });

  it("POST login con cuerpo inválido responde 422", async () => {
    const res = await postLogin(h, { token: "", username: "a", password: "corta" }, ALLOWED_ORIGIN);
    expect(res.status).toBe(422);
  });

  it("limita los intentos por IP", async () => {
    const token = await h.generateLink();
    let last = 0;
    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX + 2; i += 1) {
      const res = await postLogin(h, { token, username: "ana", password: "equivocada-123" }, ALLOWED_ORIGIN);
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
