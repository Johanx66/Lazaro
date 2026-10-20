import { describe, expect, it } from "vitest";
import type { Express } from "express";
import type { Server } from "http";
import { createApp } from "../../app.js";

const ALLOWED = "https://panel.empresa.example";

/** Sustituto de la sesión real: /api/* devuelve 401 salvo /api/health (igual que en main.ts). */
function fakeSessionGuard(app: Express): void {
  app.use("/api", (req, res, next) => {
    if (req.method === "GET" && req.path === "/health") return next();
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "No autenticado" } });
  });
}

async function start(allowedOrigins: string[]): Promise<{ server: Server; url: string }> {
  const app = createApp(fakeSessionGuard, { allowedOrigins });
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("sin puerto");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

function corsHeaders(res: Response): string[] {
  return [...res.headers.keys()].filter((name) => name.startsWith("access-control-"));
}

describe("CORS por lista de orígenes", () => {
  it("origen permitido: responde con ese origen exacto y Vary: Origin", async () => {
    const { server, url } = await start([ALLOWED, "https://otro.example"]);
    try {
      const res = await fetch(`${url}/api/health`, { headers: { Origin: ALLOWED } });
      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED);
      expect(res.headers.get("vary")?.toLowerCase()).toContain("origin");
      expect(res.headers.get("access-control-allow-credentials")).toBeNull();
    } finally {
      server.close();
    }
  }, 10000);

  it("origen no permitido: sin cabeceras CORS y sin error 500", async () => {
    const { server, url } = await start([ALLOWED]);
    try {
      for (const origin of ["https://malo.example", "http://panel.empresa.example", `${ALLOWED}:8443`]) {
        const res = await fetch(`${url}/api/health`, { headers: { Origin: origin } });
        expect(res.status).toBe(200);
        expect(corsHeaders(res)).toEqual([]);
      }
    } finally {
      server.close();
    }
  }, 10000);

  it("lista vacía: no se monta CORS, ninguna cabecera Access-Control-*", async () => {
    const { server, url } = await start([]);
    try {
      const res = await fetch(`${url}/api/health`, { headers: { Origin: ALLOWED } });
      expect(res.status).toBe(200);
      expect(corsHeaders(res)).toEqual([]);

      const preflight = await fetch(`${url}/api/knowledge`, {
        method: "OPTIONS",
        headers: { Origin: ALLOWED, "Access-Control-Request-Method": "POST" },
      });
      expect(corsHeaders(preflight)).toEqual([]);
    } finally {
      server.close();
    }
  }, 10000);

  it("preflight a /api/knowledge desde origen permitido: 204 con cabeceras, no 401", async () => {
    const { server, url } = await start([ALLOWED]);
    try {
      const res = await fetch(`${url}/api/knowledge`, {
        method: "OPTIONS",
        headers: {
          Origin: ALLOWED,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Content-Type",
        },
      });
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED);
      expect(res.headers.get("access-control-allow-methods")).toBe("GET,POST,PUT,PATCH,DELETE");
      expect(res.headers.get("access-control-allow-headers")).toBe("Content-Type");
      expect(res.headers.get("access-control-allow-credentials")).toBeNull();
    } finally {
      server.close();
    }
  }, 10000);

  it("preflight desde origen no permitido: sin cabeceras CORS", async () => {
    const { server, url } = await start([ALLOWED]);
    try {
      const res = await fetch(`${url}/api/knowledge`, {
        method: "OPTIONS",
        headers: { Origin: "https://malo.example", "Access-Control-Request-Method": "POST" },
      });
      expect(res.status).toBeLessThan(500);
      expect(corsHeaders(res)).toEqual([]);
    } finally {
      server.close();
    }
  }, 10000);

  it("regresión: /api/* sigue 401 sin sesión y /api/health sigue público", async () => {
    const { server, url } = await start([ALLOWED]);
    try {
      const protectedRes = await fetch(`${url}/api/knowledge`, { headers: { Origin: ALLOWED } });
      expect(protectedRes.status).toBe(401);
      const body = (await protectedRes.json()) as { error: { code: string } };
      expect(body.error.code).toBe("UNAUTHORIZED");

      const health = await fetch(`${url}/api/health`);
      expect(health.status).toBe(200);
    } finally {
      server.close();
    }
  }, 10000);
});
