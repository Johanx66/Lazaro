import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import express from "express";
import { readFileSync, readdirSync } from "node:fs";
import type { Server } from "node:http";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "../../../generated/prisma/client.js";
import { errorHandler } from "../../../shared/errors/error-handler.js";
import { SessionService } from "../../auth/application/session-service.js";
import { createRequireSession, requireRole } from "../../auth/presentation/api-guard.js";
import { InMemoryAdminAuthRepository } from "../../auth/tests/in-memory-admin-auth-repository.js";
import { CreateKnowledgeUseCase } from "../application/use-cases/create-knowledge.js";
import { GetKnowledgeUseCase } from "../application/use-cases/get-knowledge.js";
import { ListKnowledgeUseCase } from "../application/use-cases/list-knowledge.js";
import { UpdateKnowledgeUseCase } from "../application/use-cases/update-knowledge.js";
import { PrismaKnowledgeRepository } from "../infrastructure/prisma-knowledge-repository.js";
import { KnowledgeController } from "../presentation/knowledge-controller.js";
import { knowledgeRoutes } from "../presentation/knowledge-routes.js";

interface Page {
  items: Array<{ id: string; title: string }>;
  page: number;
  pageSize: number;
  total: number;
}

let pglite: PGlite;
let socket: PGLiteSocketServer;
let prisma: PrismaClient;
let server: Server;
let base: string;
let adminToken: string;
let agentToken: string;

const at = (n: number): Date => new Date(Date.UTC(2026, 0, 1, 0, 0, n));

interface SeedData {
  title?: string;
  content?: string;
  category?: string;
  keywords?: string[];
  active?: boolean;
  t?: number;
}

async function seed(id: string, data: SeedData = {}): Promise<void> {
  await prisma.knowledgeArticle.create({
    data: {
      id,
      title: data.title ?? `Título ${id}`,
      content: data.content ?? "contenido neutro",
      category: data.category ?? "general",
      keywords: data.keywords ?? [],
      active: data.active ?? true,
      createdAt: at(data.t ?? 0),
    },
  });
}

async function list(query: string, token = adminToken): Promise<Response> {
  return fetch(`${base}/api/knowledge${query}`, { headers: { cookie: `chatbot_session=${token}` } });
}

async function ok(query: string): Promise<Page> {
  const res = await list(query);
  expect(res.status).toBe(200);
  return (await res.json()) as Page;
}

const ids = (p: Page): string[] => p.items.map((i) => i.id);

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.waitReady;
  const migrationsDir = join(process.cwd(), "prisma", "migrations");
  for (const dir of readdirSync(migrationsDir).filter((d) => /^\d{4}_/.test(d)).sort()) {
    await pglite.exec(readFileSync(join(migrationsDir, dir, "migration.sql"), "utf8"));
  }
  socket = new PGLiteSocketServer({ db: pglite, port: 0, host: "127.0.0.1", maxConnections: 5 });
  await socket.start();
  const port = socket.getServerConn().split(":").pop();
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: `postgres://postgres:postgres@127.0.0.1:${port}/postgres` }),
  });

  const repository = new PrismaKnowledgeRepository(prisma);
  const controller = new KnowledgeController({
    create: new CreateKnowledgeUseCase(repository),
    list: new ListKnowledgeUseCase(repository),
    get: new GetKnowledgeUseCase(repository),
    update: new UpdateKnowledgeUseCase(repository),
  });
  const auth = new InMemoryAdminAuthRepository();
  const sessions = new SessionService({ repository: auth, clock: { now: () => new Date() } });
  const admin = auth.addAdmin({ email: "admin@example.com", passwordHash: "hash-de-prueba", role: "ADMIN" });
  const agent = auth.addAdmin({ email: "agente@example.com", passwordHash: "hash-de-prueba", role: "AGENT" });
  adminToken = (await sessions.create(admin.id)).token;
  agentToken = (await sessions.create(agent.id)).token;

  const app = express();
  app.use(express.json());
  app.use("/api", createRequireSession(sessions));
  app.use("/api/knowledge", requireRole("ADMIN"));
  app.use("/api/knowledge", knowledgeRoutes(controller));
  app.use(errorHandler);
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
}, 60000);

afterAll(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  await prisma?.$disconnect();
  await socket?.stop();
  await pglite?.close();
});

beforeEach(async () => {
  await prisma.knowledgeArticle.deleteMany();
});

describe("GET /api/knowledge: paginación y valores por defecto", () => {
  it("sin parámetros: page 1, pageSize 20, active=all (incluye inactivos) y total real", async () => {
    for (let i = 1; i <= 25; i++) await seed(`a${String(i).padStart(2, "0")}`, { t: i, active: i !== 25 });
    const p = await ok("");
    expect(p.page).toBe(1);
    expect(p.pageSize).toBe(20);
    expect(p.total).toBe(25);
    expect(p.items).toHaveLength(20);
    expect(p.items[0]?.id).toBe("a25");
  });

  it("acepta los límites page=1, pageSize=1 y pageSize=100", async () => {
    await seed("a1", { t: 1 });
    await seed("a2", { t: 2 });
    expect(ids(await ok("?page=1&pageSize=1"))).toEqual(["a2"]);
    const p = await ok("?pageSize=100");
    expect(p.pageSize).toBe(100);
    expect(p.items).toHaveLength(2);
  });

  it("página fuera de rango devuelve items vacío con el total real", async () => {
    await seed("a1");
    await seed("a2", { t: 1 });
    const p = await ok("?page=9&pageSize=10");
    expect(p).toMatchObject({ items: [], page: 9, pageSize: 10, total: 2 });
  });

  it("orden createdAt desc con id desc como desempate, estable entre páginas", async () => {
    await seed("b", { t: 5 });
    await seed("a", { t: 5 });
    await seed("c", { t: 5 });
    await seed("z", { t: 1 });
    expect(ids(await ok("?pageSize=10"))).toEqual(["c", "b", "a", "z"]);
    const p1 = await ok("?pageSize=2&page=1");
    const p2 = await ok("?pageSize=2&page=2");
    expect([...ids(p1), ...ids(p2)]).toEqual(["c", "b", "a", "z"]);
  });
});

describe("GET /api/knowledge: búsqueda q", () => {
  beforeEach(async () => {
    await seed("t", { title: "Imprimir FACTURA", t: 1 });
    await seed("c", { content: "Pasos para Cerrar caja", t: 2 });
    await seed("g", { category: "Nómina", t: 3 });
    await seed("k", { keywords: ["reembolso"], t: 4 });
  });

  it("por título, sin distinguir mayúsculas", async () => {
    expect(ids(await ok("?q=factura"))).toEqual(["t"]);
  });
  it("por contenido, sin distinguir mayúsculas", async () => {
    expect(ids(await ok("?q=CERRAR%20caja"))).toEqual(["c"]);
  });
  it("por categoría, sin distinguir mayúsculas", async () => {
    expect(ids(await ok(`?q=${encodeURIComponent("NÓMINA")}`))).toEqual(["g"]);
  });
  it("por keyword con coincidencia exacta (se pasa a minúsculas; parcial no coincide)", async () => {
    expect(ids(await ok("?q=Reembolso"))).toEqual(["k"]);
    expect(ids(await ok("?q=reembol"))).toEqual([]);
  });
  it("q vacío o solo espacios equivale a no filtrar", async () => {
    expect((await ok("?q=")).total).toBe(4);
    expect((await ok("?q=%20%20")).total).toBe(4);
  });
  it("recorta espacios alrededor de q", async () => {
    expect(ids(await ok("?q=%20factura%20"))).toEqual(["t"]);
  });
  it("% y _ se tratan como texto literal, no como comodines", async () => {
    await seed("p", { title: "Descuento 50% hoy", t: 5 });
    await seed("u", { title: "usuario_admin", t: 6 });
    expect(ids(await ok("?q=%25"))).toEqual(["p"]);
    expect(ids(await ok("?q=%5F"))).toEqual(["u"]);
    expect(ids(await ok("?q=a%25z"))).toEqual([]);
    expect(ids(await ok("?q=usuario%5Fadmin"))).toEqual(["u"]);
  });
});

describe("GET /api/knowledge: filtros", () => {
  it("active=true, active=false y active=all", async () => {
    await seed("on", { active: true, t: 1 });
    await seed("off", { active: false, t: 2 });
    expect(ids(await ok("?active=true"))).toEqual(["on"]);
    expect(ids(await ok("?active=false"))).toEqual(["off"]);
    expect((await ok("?active=all")).total).toBe(2);
  });

  it("combina q + category + active + paginación", async () => {
    for (let i = 1; i <= 5; i++) await seed(`f${i}`, { title: `Factura ${i}`, category: "Ventas", t: i });
    await seed("otra", { title: "Factura x", category: "Compras", t: 9 });
    await seed("inact", { title: "Factura y", category: "Ventas", active: false, t: 10 });
    const p = await ok("?q=factura&category=Ventas&active=true&pageSize=2&page=2");
    expect(p.total).toBe(5);
    expect(ids(p)).toEqual(["f3", "f2"]);
  });
});

describe("GET /api/knowledge: validación 422", () => {
  const cases: Array<[string, string]> = [
    ["page=0", "?page=0"],
    ["page=abc", "?page=abc"],
    ["page negativo", "?page=-1"],
    ["page decimal", "?page=1.5"],
    ["page vacío", "?page="],
    ["page repetido", "?page=1&page=2"],
    ["pageSize=0", "?pageSize=0"],
    ["pageSize=101", "?pageSize=101"],
    ["pageSize=abc", "?pageSize=abc"],
    ["pageSize repetido", "?pageSize=1&pageSize=2"],
    ["active=quizas", "?active=quizas"],
    ["active vacío", "?active="],
    ["active repetido", "?active=true&active=false"],
    ["q repetido", "?q=a&q=b"],
    ["q de 101 caracteres", `?q=${"x".repeat(101)}`],
    ["category repetido", "?category=a&category=b"],
    ["category vacío", "?category=%20"],
  ];
  it.each(cases)("%s responde 422 VALIDATION_ERROR en español", async (_name, query) => {
    const res = await list(query);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message.length).toBeGreaterThan(0);
  });

  it("q de exactamente 100 caracteres es válido", async () => {
    expect((await list(`?q=${"x".repeat(100)}`)).status).toBe(200);
  });
});

describe("GET /api/knowledge: autenticación y autorización", () => {
  it("sin sesión devuelve 401", async () => {
    const res = await fetch(`${base}/api/knowledge`);
    expect(res.status).toBe(401);
  });
  it("con rol AGENT devuelve 403", async () => {
    const res = await list("", agentToken);
    expect(res.status).toBe(403);
  });
});
