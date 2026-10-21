import { describe, expect, it, vi, afterEach } from "vitest";
import { DEFAULT_COMPANY_CUSTOMER_ID_PATTERN } from "../../modules/identity/domain/customer-code.js";
import { validateConfig } from "./validate.js";

describe("COMPANY_CUSTOMER_ID_PATTERN", () => {
  const original = process.env;

  afterEach(() => {
    process.env = { ...original };
    vi.resetModules();
  });

  it("sin valor no reporta incidencia (se usa el patrón por defecto)", () => {
    process.env.NODE_ENV = "development";
    delete process.env.COMPANY_CUSTOMER_ID_PATTERN;
    const issues = validateConfig("development").filter(
      (i) => i.key === "COMPANY_CUSTOMER_ID_PATTERN",
    );
    expect(issues).toEqual([]);
  });

  it("un patrón válido no reporta incidencia", () => {
    process.env.NODE_ENV = "development";
    process.env.COMPANY_CUSTOMER_ID_PATTERN = "^CLI-\\d{6}$";
    const issues = validateConfig("development").filter(
      (i) => i.key === "COMPANY_CUSTOMER_ID_PATTERN",
    );
    expect(issues).toEqual([]);
  });

  it("un patrón que no es una expresión regular válida es incidencia", () => {
    process.env.NODE_ENV = "development";
    process.env.COMPANY_CUSTOMER_ID_PATTERN = "([";
    const issues = validateConfig("development").filter(
      (i) => i.key === "COMPANY_CUSTOMER_ID_PATTERN",
    );
    expect(issues).toHaveLength(1);
  });

  it("env usa el patrón configurado y, si falta, el por defecto", async () => {
    process.env.COMPANY_CUSTOMER_ID_PATTERN = "^CLI-\\d{6}$";
    const { env } = await import("./env.js?patron-configurado");
    expect(env.companyCustomerIdPattern).toBe("^CLI-\\d{6}$");

    delete process.env.COMPANY_CUSTOMER_ID_PATTERN;
    vi.resetModules();
    const { env: envPorDefecto } = await import("./env.js?patron-por-defecto");
    expect(envPorDefecto.companyCustomerIdPattern).toBe(DEFAULT_COMPANY_CUSTOMER_ID_PATTERN);
  });
});
