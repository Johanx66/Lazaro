import { ValidationError } from "../../../shared/errors/app.error.js";
import type { CreateUserInput, UpdateUserInput } from "../domain/entities/user.js";

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCreateUser(input: CreateUserInput): CreateUserInput {
  if (!input.name || input.name.trim().length === 0) {
    throw new ValidationError("El nombre del usuario es obligatorio");
  }
  if (!input.phone || input.phone.trim().length === 0) {
    throw new ValidationError("El teléfono del usuario es obligatorio");
  }
  if (input.email !== null && !EMAIL_REGEX.test(input.email)) {
    throw new ValidationError("El correo no tiene un formato válido");
  }
  if (!input.externalCustomerId || input.externalCustomerId.trim().length === 0) {
    throw new ValidationError("El identificador del cliente (externalCustomerId) es obligatorio");
  }
  return {
    name: input.name.trim(),
    phone: input.phone.trim(),
    email: input.email?.trim() ?? null,
    externalCustomerId: input.externalCustomerId.trim(),
  };
}

export function validateUpdateUser(input: UpdateUserInput): UpdateUserInput {
  if (input.name !== undefined && input.name.trim().length === 0) {
    throw new ValidationError("El nombre del usuario no puede quedar vacío");
  }
  if (input.phone !== undefined && input.phone.trim().length === 0) {
    throw new ValidationError("El teléfono del usuario no puede quedar vacío");
  }
  if (input.email !== undefined && input.email !== null && !EMAIL_REGEX.test(input.email)) {
    throw new ValidationError("El correo no tiene un formato válido");
  }
  if (input.externalCustomerId !== undefined && input.externalCustomerId.trim().length === 0) {
    throw new ValidationError("El identificador del cliente no puede quedar vacío");
  }
  return {
    name: input.name?.trim(),
    phone: input.phone?.trim(),
    email: input.email === undefined ? undefined : input.email?.trim() ?? null,
    externalCustomerId: input.externalCustomerId?.trim(),
  };
}