import { requireString, optionalString } from "../../../shared/http/request.js";
import type { CreateUserInput, UpdateUserInput } from "../domain/entities/user.js";

export function toCreateUserInput(body: Record<string, unknown>): CreateUserInput {
  return {
    name: requireString(body, "name"),
    phone: requireString(body, "phone"),
    email: optionalString(body, "email") ?? null,
    externalCustomerId: requireString(body, "externalCustomerId"),
  };
}

export function toUpdateUserInput(body: Record<string, unknown>): UpdateUserInput {
  return {
    name: optionalString(body, "name") ?? undefined,
    phone: optionalString(body, "phone") ?? undefined,
    email: optionalString(body, "email"),
    externalCustomerId: optionalString(body, "externalCustomerId") ?? undefined,
  };
}