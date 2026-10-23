import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const html = readFileSync(new URL("../../../../public/login.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../../../../public/login.js", import.meta.url), "utf8");

interface FakeElement {
  hidden: boolean;
  type: string;
  value: string;
  textContent: string;
  attributes: Map<string, string>;
  listeners: Map<string, (event: { preventDefault(): void }) => void>;
  focus(): void;
  addEventListener(name: string, listener: (event: { preventDefault(): void }) => void): void;
  setAttribute(name: string, value: string): void;
}

function fakeElement(type = ""): FakeElement {
  return {
    hidden: false, type, value: "", textContent: "", attributes: new Map(), listeners: new Map(),
    focus() {},
    addEventListener(name, listener) { this.listeners.set(name, listener); },
    setAttribute(name, value) { this.attributes.set(name, value); },
  };
}

describe("página de acceso: visibilidad de contraseña", () => {
  it("empieza oculta y el botón accesible alterna mostrar/ocultar sin almacenar el valor", () => {
    const password = fakeElement("password");
    const toggle = fakeElement();
    const ids: Record<string, FakeElement> = {
      loadingView: fakeElement(), invalidView: fakeElement(), invalidError: fakeElement(), formView: fakeElement(),
      maskedContact: fakeElement(), loginForm: fakeElement(), username: fakeElement(), password, passwordToggle: toggle,
      formError: fakeElement(), submitBtn: fakeElement(), successView: fakeElement(), successName: fakeElement(),
    };
    const document = { getElementById: (id: string) => ids[id] };
    const fetch = vi.fn(async () => ({ status: 200, json: async () => ({ maskedContact: "***1234" }) }));
    runInNewContext(script, { window: { location: { search: "?t=fake-token" } }, document, fetch, URLSearchParams });

    expect(password.type).toBe("password");
    expect(html).toMatch(/id="password" type="password"/u);
    expect(html).toContain('aria-label="Mostrar contraseña"');
    toggle.listeners.get("click")?.({ preventDefault() {} });
    expect(password.type).toBe("text");
    expect(toggle.attributes.get("aria-label")).toBe("Ocultar contraseña");
    expect(toggle.attributes.get("aria-pressed")).toBe("true");
    toggle.listeners.get("click")?.({ preventDefault() {} });
    expect(password.type).toBe("password");
    expect(toggle.attributes.get("aria-label")).toBe("Mostrar contraseña");
    expect(fetch).toHaveBeenCalledOnce();
    expect(script).not.toMatch(/localStorage|sessionStorage|console\.(?:log|info|warn|error)\([^\n]*password/iu);
  });
});
