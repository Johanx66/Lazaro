import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Argon2PasswordHasher } from "../../../shared/infrastructure/argon2-password-hasher.js";
import { errorHandler } from "../../../shared/errors/error-handler.js";
import {
  ACCOUNT_LOCK_DURATION_MS,
  INVALID_CREDENTIALS_MESSAGE,
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_IDLE_TIMEOUT_MS,
} from "../application/session-policy.js";
import { hashSessionToken } from "../application/session-token.js";
import type { Clock } from "../domain/admin-auth-repository.js";
import { createAuthRouter } from "../index.js";
import { InMemoryAdminAuthRepository } from "./in-memory-admin-auth-repository.js";

const EMAIL = "admin@example.com";
const PASSWORD = "contrasena-de-prueba-123";
const WRONG_PASSWORD = "contrasena-equivocada-999";
const MINUTE = 60_000;

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
  hasher: Argon2PasswordHasher;
  base: string;
  server: Server;
}

let passwordHash: string;
const servers: Server[] = [];

beforeAll(async () => {
  passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

async function startHarness(options: { secureCookies?: boolean } = {}): Promise<Harness> {
  const repository = new InMemoryAdminAuthRepository();
  const clock = new MutableClock(new Date("2026-01-01T10:00:00.000Z"));
  const hasher = new Argon2PasswordHasher();
  const app = express();
  app.use(express.json());
  app.use(
    "/auth",
    createAuthRouter({ repository, hasher, clock, secureCookies: options.secureCookies ?? false }),
  );
  app.use(errorHandler);
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  servers.push(server);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { repository, clock, hasher, server, base: `http://127.0.0.1:${port}` };
}

function login(h: Harness, email: string, password: string): Promise<Response> {
  return fetch(`${h.base}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

function me(h: Harness, token?: string): Promise<Response> {
  return fetch(`${h.base}/auth/me`, {
    headers: token ? { cookie: `chatbot_session=${token}` } : {},
  });
}

function logout(h: Harness, token?: string): Promise<Response> {
  return fetch(`${h.base}/auth/logout`, {
    method: "POST",
    headers: token ? { cookie: `chatbot_session=${token}` } : {},
  });
}

function tokenFrom(res: Response): string {
  const header = res.headers.getSetCookie()[0] ?? "";
  const match = /^chatbot_session=([^;]+)/.exec(header);
  if (!match?.[1]) throw new Error("la respuesta no trae cookie de sesión");
  return match[1];
}

async function loggedIn(h: Harness): Promise<string> {
  const res = await login(h, EMAIL, PASSWORD);
  expect(res.status).toBe(200);
  return tokenFrom(res);
}

describe("POST /auth/login", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness();
    h.repository.addAdmin({ email: EMAIL, passwordHash, role: "ADMIN" });
  });

  it("login correcto responde 200 con email y rol, y cookie con los flags esperados", async () => {
    const res = await login(h, EMAIL, PASSWORD);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: EMAIL, role: "ADMIN" });

    const cookie = res.headers.getSetCookie()[0] ?? "";
    expect(cookie).toMatch(/^chatbot_session=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toMatch(/Domain=/i);
    expect(cookie).not.toMatch(/Secure/i);
  });

  it("la cookie lleva Secure cuando secureCookies está activo (producción)", async () => {
    const prod = await startHarness({ secureCookies: true });
    prod.repository.addAdmin({ email: EMAIL, passwordHash });
    const res = await login(prod, EMAIL, PASSWORD);
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()[0]).toContain("Secure");
  });

  it("contraseña incorrecta responde 401 con el mensaje genérico", async () => {
    const res = await login(h, EMAIL, WRONG_PASSWORD);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "INVALID_CREDENTIALS", message: INVALID_CREDENTIALS_MESSAGE },
    });
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("usuario inexistente responde 401 con exactamente el mismo cuerpo que contraseña incorrecta", async () => {
    const wrongPassword = await login(h, EMAIL, WRONG_PASSWORD);
    const unknownUser = await login(h, "nadie@example.com", PASSWORD);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(await unknownUser.text()).toBe(await wrongPassword.text());
  });

  it("usuario inexistente ejecuta igualmente un verify contra el hash de relleno", async () => {
    const verify = vi.spyOn(Argon2PasswordHasher.prototype, "verify");
    await login(h, "nadie@example.com", PASSWORD);
    expect(verify).toHaveBeenCalledTimes(1);
    const [usedHash] = verify.mock.calls[0] ?? [];
    expect(usedHash).toMatch(/^\$argon2id\$/);
    expect(usedHash).not.toBe(passwordHash);
  });

  it("usuario inactivo responde 401 con el mensaje genérico aunque la contraseña sea correcta", async () => {
    h.repository.addAdmin({ email: "inactivo@example.com", passwordHash, active: false });
    const res = await login(h, "inactivo@example.com", PASSWORD);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "INVALID_CREDENTIALS", message: INVALID_CREDENTIALS_MESSAGE },
    });
  });

  it("5 fallos seguidos bloquean la cuenta y luego la contraseña correcta sigue dando 401", async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await login(h, EMAIL, WRONG_PASSWORD)).status).toBe(401);
    }
    const admin = h.repository.adminByEmail(EMAIL);
    expect(admin.failedAttempts).toBe(5);
    expect(admin.lockedUntil?.getTime()).toBe(h.clock.now().getTime() + ACCOUNT_LOCK_DURATION_MS);

    const res = await login(h, EMAIL, PASSWORD);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "INVALID_CREDENTIALS", message: INVALID_CREDENTIALS_MESSAGE },
    });
  });

  it("4 fallos no bloquean: la contraseña correcta entra", async () => {
    for (let i = 0; i < 4; i += 1) {
      await login(h, EMAIL, WRONG_PASSWORD);
    }
    expect(h.repository.adminByEmail(EMAIL).lockedUntil).toBeNull();
    expect((await login(h, EMAIL, PASSWORD)).status).toBe(200);
  });

  it("el desbloqueo ocurre pasados 15 minutos (tiempo simulado)", async () => {
    for (let i = 0; i < 5; i += 1) {
      await login(h, EMAIL, WRONG_PASSWORD);
    }
    h.clock.advance(ACCOUNT_LOCK_DURATION_MS - 1000);
    expect((await login(h, EMAIL, PASSWORD)).status).toBe(401);

    h.clock.advance(1000);
    const res = await login(h, EMAIL, PASSWORD);
    expect(res.status).toBe(200);
    const admin = h.repository.adminByEmail(EMAIL);
    expect(admin.lockedUntil).toBeNull();
    expect(admin.failedAttempts).toBe(0);
  });

  it("tras vencer el bloqueo, un fallo no vuelve a bloquear de inmediato (5 intentos nuevos)", async () => {
    for (let i = 0; i < 5; i += 1) {
      await login(h, EMAIL, WRONG_PASSWORD);
    }
    h.clock.advance(ACCOUNT_LOCK_DURATION_MS);
    expect((await login(h, EMAIL, WRONG_PASSWORD)).status).toBe(401);
    const admin = h.repository.adminByEmail(EMAIL);
    expect(admin.failedAttempts).toBe(1);
    expect(admin.lockedUntil).toBeNull();
  });

  it("un login correcto reinicia failedAttempts", async () => {
    for (let i = 0; i < 3; i += 1) {
      await login(h, EMAIL, WRONG_PASSWORD);
    }
    expect(h.repository.adminByEmail(EMAIL).failedAttempts).toBe(3);
    expect((await login(h, EMAIL, PASSWORD)).status).toBe(200);
    const admin = h.repository.adminByEmail(EMAIL);
    expect(admin.failedAttempts).toBe(0);
    expect(admin.lockedUntil).toBeNull();
  });

  it("el token guardado en la BD no es el de la cookie (solo su hash SHA-256)", async () => {
    const token = tokenFrom(await login(h, EMAIL, PASSWORD));
    const stored = [...h.repository.sessions.values()];
    expect(stored).toHaveLength(1);
    expect(stored[0]?.tokenHash).not.toBe(token);
    expect(stored[0]?.tokenHash).toBe(hashSessionToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it("la respuesta de login no contiene hash ni token en el cuerpo", async () => {
    const res = await login(h, EMAIL, PASSWORD);
    const token = tokenFrom(res);
    const body = await res.text();
    expect(body).not.toContain(passwordHash);
    expect(body).not.toContain("argon2");
    expect(body).not.toContain(token);
    expect(Object.keys(JSON.parse(body) as Record<string, unknown>).sort()).toEqual(["email", "role"]);
  });

  it("el log de un fallo no contiene la contraseña, el hash ni el email, pero sí el motivo", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await login(h, EMAIL, WRONG_PASSWORD);
    await login(h, "nadie@example.com", WRONG_PASSWORD);

    const output = warn.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(warn).toHaveBeenCalledTimes(2);
    expect(output).toContain("wrong_password");
    expect(output).toContain("unknown_user");
    expect(output).toContain('"ip"');
    expect(output).not.toContain(WRONG_PASSWORD);
    expect(output).not.toContain(PASSWORD);
    expect(output).not.toContain(passwordHash);
    expect(output).not.toContain("example.com");
  });

  it("un cuerpo inválido responde 422 con formato de error y sin tocar la BD", async () => {
    const res = await fetch(`${h.base}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "no-es-un-email", password: PASSWORD }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(body)).not.toContain(PASSWORD);
  });

  it("normaliza el email (mayúsculas y espacios) antes de buscar al usuario", async () => {
    const res = await login(h, "  Admin@Example.COM ", PASSWORD);
    expect(res.status).toBe(200);
  });

  it("rate-limit por IP: la petición 11 en un minuto responde 429 con formato de error", async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await login(h, "nadie@example.com", WRONG_PASSWORD)).status).toBe(401);
    }
    const res = await login(h, EMAIL, PASSWORD);
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("TOO_MANY_REQUESTS");
    expect(typeof body.error.message).toBe("string");
  });
});

describe("sesiones: GET /auth/me y POST /auth/logout", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness();
    h.repository.addAdmin({ email: EMAIL, passwordHash, role: "AGENT" });
  });

  it("/auth/me con sesión válida devuelve email y rol, y actualiza lastSeenAt", async () => {
    const token = await loggedIn(h);
    h.clock.advance(10 * MINUTE);
    const res = await me(h, token);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: EMAIL, role: "AGENT" });
    const [session] = [...h.repository.sessions.values()];
    expect(session?.lastSeenAt.getTime()).toBe(h.clock.now().getTime());
  });

  it("/auth/me sin sesión responde 401 con formato de error", async () => {
    const res = await me(h);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("/auth/me con un token desconocido o mal formado responde 401", async () => {
    expect((await me(h, "x".repeat(43))).status).toBe(401);
    expect((await me(h, "corto")).status).toBe(401);
  });

  it("la sesión vence a los 30 minutos de inactividad, responde 401 y se borra de la BD", async () => {
    const token = await loggedIn(h);
    h.clock.advance(SESSION_IDLE_TIMEOUT_MS - 1000);
    expect((await me(h, token)).status).toBe(200);

    h.clock.advance(SESSION_IDLE_TIMEOUT_MS);
    const res = await me(h, token);
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie()[0]).toMatch(/^chatbot_session=;/);
    expect(h.repository.sessions.size).toBe(0);
  });

  it("la inactividad es deslizante: la actividad cada 20 minutos mantiene la sesión", async () => {
    const token = await loggedIn(h);
    for (let i = 0; i < 3; i += 1) {
      h.clock.advance(20 * MINUTE);
      expect((await me(h, token)).status).toBe(200);
    }
  });

  it("la sesión vence a las 12 horas absolutas aunque haya actividad constante", async () => {
    const token = await loggedIn(h);
    const step = 20 * MINUTE;
    let elapsed = 0;
    while (elapsed + step < SESSION_ABSOLUTE_TIMEOUT_MS) {
      h.clock.advance(step);
      elapsed += step;
      expect((await me(h, token)).status).toBe(200);
    }
    h.clock.advance(SESSION_ABSOLUTE_TIMEOUT_MS - elapsed);
    const res = await me(h, token);
    expect(res.status).toBe(401);
    expect(h.repository.sessions.size).toBe(0);
  });

  it("una sesión de un usuario desactivado deja de ser válida", async () => {
    const token = await loggedIn(h);
    h.repository.adminByEmail(EMAIL).active = false;
    expect((await me(h, token)).status).toBe(401);
    expect(h.repository.sessions.size).toBe(0);
  });

  it("logout invalida la sesión, limpia la cookie y responde 204", async () => {
    const token = await loggedIn(h);
    const res = await logout(h, token);
    expect(res.status).toBe(204);
    const cookie = res.headers.getSetCookie()[0] ?? "";
    expect(cookie).toMatch(/^chatbot_session=;/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(h.repository.sessions.size).toBe(0);
    expect((await me(h, token)).status).toBe(401);
  });

  it("logout sin sesión también responde 204", async () => {
    expect((await logout(h)).status).toBe(204);
    expect((await logout(h, "x".repeat(43))).status).toBe(204);
  });
});
