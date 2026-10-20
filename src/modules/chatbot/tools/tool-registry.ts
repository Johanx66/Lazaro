import { z } from 'zod';
import type { Pool } from 'pg';
import type { CompanyRole } from '../../identity/domain/entities/company-user.js';

export interface ToolContext {
  authenticatedUserId: string;
  userRole: CompanyRole;
}

/** Definición tipada de una herramienta (params y resultado concretos). */
export interface ToolDefinition<TParams, TResult> {
  name: string;
  description: string;
  schema: z.ZodType<TParams>;
  allowedRoles: readonly CompanyRole[];
  executeQuery(params: TParams, context: ToolContext, companyDb: Pool): Promise<TResult>;
}

/**
 * Resultado de validar los parámetros con el esquema Zod de una herramienta.
 * En caso de éxito devuelve los datos con defaults y coerciones ya aplicados.
 */
export type ParsedParams =
  | { ok: true; data: unknown }
  | { ok: false };

/**
 * Vista de runtime que almacena el registro. Los parámetros entran como `unknown`
 * y se validan con el esquema Zod de cada herramienta antes de ejecutar.
 */
export interface Tool {
  name: string;
  description: string;
  allowedRoles: readonly CompanyRole[];
  /** Valida con Zod y devuelve los datos con defaults/coerciones aplicados. */
  parse(params: unknown): ParsedParams;
  /** Ejecuta con datos ya validados por `parse`. */
  execute(params: unknown, context: ToolContext, companyDb: Pool): Promise<unknown>;
}

/** Envuelve una definición tipada en la vista de runtime sin usar `any`. */
export function defineTool<TParams, TResult>(definition: ToolDefinition<TParams, TResult>): Tool {
  return {
    name: definition.name,
    description: definition.description,
    allowedRoles: definition.allowedRoles,
    parse: (params) => {
      const result = definition.schema.safeParse(params);
      return result.success ? { ok: true, data: result.data } : { ok: false };
    },
    execute: (params, context, companyDb) =>
      definition.executeQuery(params as TParams, context, companyDb),
  };
}

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAllForRole(role: CompanyRole): Tool[] {
    return Array.from(this.tools.values()).filter((tool) => tool.allowedRoles.includes(role));
  }
}
