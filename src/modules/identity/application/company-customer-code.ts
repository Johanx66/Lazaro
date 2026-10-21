import {
  DEFAULT_COMPANY_CUSTOMER_ID_PATTERN,
  validateCompanyCustomerId,
  type CompanyCustomerIdError,
} from "../domain/customer-code.js";
import type { CompanyUserRepository } from "../domain/repositories/company-user-repository.js";
import { CompanyCustomerIdTakenError, InvalidCompanyCustomerIdError } from "./errors.js";

function messageFor(reason: CompanyCustomerIdError): string {
  switch (reason) {
    case "empty":
      return "El código de cliente no puede estar vacío";
    case "too_long":
      return "El código de cliente es demasiado largo";
    case "format":
      return "El código de cliente no tiene un formato válido (ejemplo: CLI-000123)";
  }
}

/**
 * Valida y normaliza un código de cliente de la BD de la empresa y comprueba que
 * esté libre. Devuelve el código ya normalizado (mayúsculas, sin espacios).
 *
 * `ownerId` permite reasignar el mismo código al usuario que ya lo tiene: dos
 * usuarios distintos NUNCA pueden compartir código (lo garantiza además el índice
 * único de la base de datos del bot).
 */
export async function resolveCompanyCustomerId(
  raw: string,
  ownerId: string,
  repository: CompanyUserRepository,
  pattern: string = DEFAULT_COMPANY_CUSTOMER_ID_PATTERN,
): Promise<string> {
  const result = validateCompanyCustomerId(raw, pattern);
  if (!result.ok) {
    throw new InvalidCompanyCustomerIdError(messageFor(result.reason));
  }

  const existing = await repository.findByCompanyCustomerId(result.value);
  if (existing && existing.id !== ownerId) {
    throw new CompanyCustomerIdTakenError();
  }
  return result.value;
}
