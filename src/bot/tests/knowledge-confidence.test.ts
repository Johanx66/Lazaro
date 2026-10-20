import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "../../generated/prisma/client.js";
import { parseFaqMinConfidence } from "../../shared/config/faq-min-confidence.js";
import { validateConfig } from "../../shared/config/validate.js";
import { StaticKnowledgeBase, scoreMatch, selectBestMatch } from "../domain/knowledge.js";
import type { KnowledgeArticle } from "../domain/knowledge.js";
import { PrismaKnowledgeBaseRepository } from "../infrastructure/prisma-knowledge-repository.js";

const RESET: KnowledgeArticle = {
  id: "r1",
  title: "Restablecer contraseña",
  content: "Usa el enlace de recuperación enviado a tu correo.",
  keywords: ["contraseña", "clave"],
};

describe("búsqueda con confianza", () => {
  it.each([
    "¿Cómo restablezco mi contraseña?",
    "COMO RESTABLECER MI CONTRASEÑA??",
    "como restablecer mi contrasena",
  ])("%s supera el umbral por defecto", (q) => {
    expect(scoreMatch(q, RESET)).toBeGreaterThanOrEqual(0.5);
    expect(selectBestMatch(q, [RESET], 0.5)).toBe(RESET.content);
  });

  it("'hi' no coincide dentro de otras palabras; hola sí saluda", async () => {
    const kb = new StaticKnowledgeBase();
    await expect(kb.findAnswer("no puedo ver mi historial")).resolves.toBeNull();
    await expect(kb.findAnswer("archivo de chile")).resolves.toBeNull();
    await expect(kb.findAnswer("hola")).resolves.toContain("asistente");
    await expect(kb.findAnswer("hola!")).resolves.toContain("asistente");
    await expect(kb.findAnswer("Hi, buenas")).resolves.toContain("asistente");
  });

  it("keywords de varias palabras coinciden como frase completa", () => {
    const a: KnowledgeArticle = { id: "f", title: "X", content: "c", keywords: ["buenos dias"] };
    expect(scoreMatch("Buenos días!", a)).toBeGreaterThanOrEqual(0.6);
    expect(scoreMatch("buenos y dias", a)).toBe(0);
  });

  it("palabras vacías no producen coincidencia", () => {
    const a: KnowledgeArticle = {
      id: "p",
      title: "Horario",
      content: "Así como puedo, te atendemos.",
      keywords: ["horario"],
    };
    expect(scoreMatch("cómo puedo pagar", a)).toBe(0);
    expect(selectBestMatch("cómo puedo pagar", [a], 0)).toBeNull();
  });

  it("sin coincidencia devuelve null y la confianza está en [0,1]", () => {
    expect(selectBestMatch("zzz qqq", [RESET], 0)).toBeNull();
    for (const q of ["", "contraseña clave restablecer", "restablecer contraseña", "x", "!!!"]) {
      const s = scoreMatch(q, RESET);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it("el umbral importa: responde con 0.3 y no con 0.9", () => {
    const a: KnowledgeArticle = {
      id: "t",
      title: "Factura electrónica",
      content: "Descarga tu factura desde el portal.",
      keywords: [],
    };
    const q = "factura electrónica";
    expect(selectBestMatch(q, [a], 0.3)).toBe(a.content);
    expect(selectBestMatch(q, [a], 0.9)).toBeNull();
  });

  it("en empate gana el primer artículo", () => {
    const a = { ...RESET, id: "1", content: "primero" };
    const b = { ...RESET, id: "2", content: "segundo" };
    expect(selectBestMatch("contraseña", [a, b], 0.5)).toBe("primero");
  });

  it("'agente' en la KB estática no responde", async () => {
    await expect(new StaticKnowledgeBase().findAnswer("agente")).resolves.toBeNull();
  });
});

describe("FAQ_MIN_CONFIDENCE", () => {
  const original = process.env.FAQ_MIN_CONFIDENCE;
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    if (original === undefined) delete process.env.FAQ_MIN_CONFIDENCE;
    else process.env.FAQ_MIN_CONFIDENCE = original;
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
  });

  it("parser: vacío o ausente => 0.5, '0.7' => 0.7, 0 y 1 válidos", () => {
    expect(parseFaqMinConfidence("")).toEqual({ ok: true, value: 0.5 });
    expect(parseFaqMinConfidence(undefined)).toEqual({ ok: true, value: 0.5 });
    expect(parseFaqMinConfidence("0.7")).toEqual({ ok: true, value: 0.7 });
    expect(parseFaqMinConfidence("0")).toEqual({ ok: true, value: 0 });
    expect(parseFaqMinConfidence("1")).toEqual({ ok: true, value: 1 });
  });

  it.each(["abc", "-1", "1.5", "NaN", "0x1"])("validateConfig rechaza %s en development", (raw) => {
    process.env.FAQ_MIN_CONFIDENCE = raw;
    const issues = validateConfig("development");
    expect(issues.some((i) => i.key === "FAQ_MIN_CONFIDENCE")).toBe(true);
  });

  it("validateConfig no reporta un valor válido o vacío", () => {
    for (const raw of ["0.7", ""]) {
      process.env.FAQ_MIN_CONFIDENCE = raw;
      expect(validateConfig("development").some((i) => i.key === "FAQ_MIN_CONFIDENCE")).toBe(false);
    }
  });
});

describe("PrismaKnowledgeBaseRepository sin reiniciar", () => {
  let pglite: PGlite;
  let socket: PGLiteSocketServer;
  let prisma: PrismaClient;

  beforeAll(async () => {
    pglite = new PGlite();
    await pglite.waitReady;
    const dir = join(process.cwd(), "prisma", "migrations");
    for (const d of readdirSync(dir).filter((x) => /^\d{4}_/.test(x)).sort()) {
      await pglite.exec(readFileSync(join(dir, d, "migration.sql"), "utf8"));
    }
    socket = new PGLiteSocketServer({ db: pglite, port: 0, host: "127.0.0.1", maxConnections: 5 });
    await socket.start();
    const port = socket.getServerConn().split(":").pop();
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: `postgres://postgres:postgres@127.0.0.1:${port}/postgres` }),
    });
  }, 60000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await socket?.stop();
    await pglite?.close();
  });

  beforeEach(async () => {
    await prisma.knowledgeArticle.deleteMany();
  });

  it("ve artículos creados, y desactivados, sin reconstruir el repositorio", async () => {
    const repo = new PrismaKnowledgeBaseRepository(prisma, 0.5);
    const q = "¿Cómo restablezco mi contraseña?";
    await expect(repo.findAnswer(q)).resolves.toBeNull();

    const created = await prisma.knowledgeArticle.create({
      data: {
        title: "Restablecer contraseña",
        content: "Usa el enlace de recuperación.",
        category: "cuenta",
        keywords: ["contraseña", "clave"],
        active: true,
      },
    });
    await expect(repo.findAnswer(q)).resolves.toBe("Usa el enlace de recuperación.");

    await prisma.knowledgeArticle.update({ where: { id: created.id }, data: { active: false } });
    await expect(repo.findAnswer(q)).resolves.toBeNull();
  });
});
