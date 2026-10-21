/**
 * Código de cliente en la BD de la empresa (p. ej. "CLI-000123").
 *
 * Es la clave con la que el chatbot filtra las consultas de datos del chat: las
 * herramientas filtran SIEMPRE por el código del cliente autenticado, que sale de
 * la sesión. NUNCA se usa el id interno del bot (`company_users.id`) como código de
 * cliente, porque ese id no existe en la BD de la empresa.
 *
 * Lo asigna un ADMIN desde el panel. Es único: dos usuarios de empresa no pueden
 * apuntar al mismo cliente.
 */

/** Patrón por defecto: 2..32 caracteres, mayúsculas, dígitos, guion y guion bajo. */
export const DEFAULT_COMPANY_CUSTOMER_ID_PATTERN = "^[A-Z0-9][A-Z0-9_-]{1,31}$";

/** Longitud máxima del código de cliente (columna VARCHAR(50) en la BD de la empresa). */
export const MAX_COMPANY_CUSTOMER_ID_LENGTH = 32;

export type CompanyCustomerIdError = "empty" | "too_long" | "format";

export type CompanyCustomerIdResult =
  | { ok: true; value: string }
  | { ok: false; reason: CompanyCustomerIdError };

/** Normaliza el código: recorta espacios y pasa a mayúsculas. */
export function normalizeCompanyCustomerId(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Valida el código de cliente contra el patrón configurado.
 * Si el patrón no es una expresión regular válida, se usa el patrón por defecto
 * (un patrón mal configurado no debe dejar sin poder asignar códigos).
 */
export function validateCompanyCustomerId(
  raw: string,
  pattern: string = DEFAULT_COMPANY_CUSTOMER_ID_PATTERN,
): CompanyCustomerIdResult {
  const value = normalizeCompanyCustomerId(raw);
  if (value.length === 0) return { ok: false, reason: "empty" };
  if (value.length > MAX_COMPANY_CUSTOMER_ID_LENGTH) return { ok: false, reason: "too_long" };

  let expression: RegExp;
  try {
    expression = new RegExp(pattern);
  } catch {
    expression = new RegExp(DEFAULT_COMPANY_CUSTOMER_ID_PATTERN);
  }
  if (!expression.test(value)) return { ok: false, reason: "format" };
  return { ok: true, value };
}
