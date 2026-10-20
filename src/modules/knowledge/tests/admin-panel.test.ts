import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../../app.js";

const adminJsPath = fileURLToPath(new URL("../../../../public/admin/admin.js", import.meta.url));

describe("panel de administración de FAQs (archivos estáticos)", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("GET /admin/ responde 200 con HTML", async () => {
    const res = await fetch(`${baseUrl}/admin/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("GET /admin/admin.js responde 200", async () => {
    const res = await fetch(`${baseUrl}/admin/admin.js`);
    expect(res.status).toBe(200);
  });

  it("admin.js no usa innerHTML ni eval(", () => {
    const source = readFileSync(adminJsPath, "utf8");
    expect(source).not.toContain("innerHTML");
    expect(source).not.toContain("eval(");
  });

  it("index.html no contiene JS inline", () => {
    const html = readFileSync(adminJsPath.replace("admin.js", "index.html"), "utf8");
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)/i);
  });
});
