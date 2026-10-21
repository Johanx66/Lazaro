import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Tool } from "../tools/tool-registry.js";
import { getCustomerBalanceTool } from "../tools/customer-balance.tool.js";
import { getOrderStatusTool } from "../tools/order-status.tool.js";
import { getRecentOrdersTool } from "../tools/recent-orders.tool.js";

const demoSqlPath = fileURLToPath(
  new URL("../../../../scripts/demo-company-db.sql", import.meta.url),
);

// Las herramientas no exponen su SQL; se ejecutan con un mock de la BD para
// capturar la consulta real y comprobar el contrato con la BD de la empresa.
interface Captured {
  sql: string;
  params: unknown[];
}

async function captureSql(tool: Tool, params: unknown, context: unknown): Promise<Captured> {
  const parsed = tool.parse(params);
  if (!parsed.ok) throw new Error(`parámetros inválidos para ${tool.name}`);
  let captured: Captured = { sql: "", params: [] };
  const db = {
    query: (sql: string, params2: unknown[] = []) => {
      captured = { sql, params: params2 };
      return Promise.resolve({ rows: [] });
    },
  };
  await tool.execute(parsed.data, context, db as never);
  return captured;
}

const NO_SCHEMA_PREFIX = /(FROM|JOIN)\s+[a-z_]+\./i;

describe("Contrato de la BD de la empresa (Fase 5) con el script de demostración", () => {
  it("v_customer_balance: columnas y filtro por customer_id", async () => {
    const { sql, params } = await captureSql(
      getCustomerBalanceTool,
      {},
      { companyCustomerId: "CLI-000123", userRole: "USER" },
    );
    expect(sql).toMatch(/FROM\s+v_customer_balance/i);
    expect(sql).toMatch(/customer_id\s*,\s*balance\s*,\s*credit_limit/i);
    expect(sql).toMatch(/WHERE\s+customer_id\s*=\s*\$1/i);
    expect(params).toEqual(["CLI-000123"]);
    // Sin esquema cualificado: el rol de lectura fija su search_path.
    expect(sql).not.toMatch(NO_SCHEMA_PREFIX);
  });

  it("v_orders_status: columnas y filtro por order_id + customer_id", async () => {
    const { sql, params } = await captureSql(
      getOrderStatusTool,
      { orderId: "123" },
      { companyCustomerId: "CLI-000123", userRole: "USER" },
    );
    expect(sql).toMatch(/FROM\s+v_orders_status/i);
    expect(sql).toMatch(/order_id\s*,\s*status\s*,\s*total_amount\s*,\s*created_at/i);
    expect(sql).toMatch(/WHERE\s+order_id\s*=\s*\$1\s+AND\s+customer_id\s*=\s*\$2/i);
    expect(params).toEqual(["123", "CLI-000123"]);
    expect(sql).not.toMatch(NO_SCHEMA_PREFIX);
  });

  it("v_recent_orders: columnas, orden por fecha y límite parametrizado", async () => {
    const { sql, params } = await captureSql(
      getRecentOrdersTool,
      { limit: 5 },
      { companyCustomerId: "CLI-000123", userRole: "USER" },
    );
    expect(sql).toMatch(/FROM\s+v_recent_orders/i);
    expect(sql).toMatch(/order_id\s*,\s*status\s*,\s*total_amount\s*,\s*created_at/i);
    expect(sql).toMatch(/WHERE\s+customer_id\s*=\s*\$1/i);
    expect(sql).toMatch(/ORDER BY created_at DESC/i);
    expect(sql).toMatch(/LIMIT\s+\$2/i);
    expect(params).toEqual(["CLI-000123", 5]);
    expect(sql).not.toMatch(NO_SCHEMA_PREFIX);
  });

  it("el script de demostración define las tres vistas del contrato", () => {
    const sql = readFileSync(demoSqlPath, "utf8");
    for (const view of ["v_customer_balance", "v_orders_status", "v_recent_orders"]) {
      expect(sql).toMatch(new RegExp(`CREATE OR REPLACE VIEW \\w+\\.${view}`, "i"));
    }
  });

  it("el script de demostración otorga SELECT sobre las vistas y no sobre las tablas base", () => {
    const sql = readFileSync(demoSqlPath, "utf8");
    // Se otorga SELECT a cada vista (mediante format con el rol).
    for (const view of ["v_customer_balance", "v_orders_status", "v_recent_orders"]) {
      expect(sql).toMatch(new RegExp(`GRANT SELECT ON \\w+\\.${view}`, "i"));
    }
    // Nunca SELECT directo sobre las tablas base.
    expect(sql).not.toMatch(/GRANT SELECT ON\s+\w+\.customers/i);
    expect(sql).not.toMatch(/GRANT SELECT ON\s+\w+\.orders\b/i);
  });
});
