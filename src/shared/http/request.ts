import type { Request } from "express";
import { ValidationError } from "../errors/app.error.js";

export function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`El campo "${key}" es obligatorio`);
  }
  return value.trim();
}

export function optionalString(
  body: Record<string, unknown>,
  key: string,
): string | null | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new ValidationError(`El campo "${key}" debe ser un texto`);
  }
  return value.trim();
}

export function param(req: Request, key: string): string {
  const value = req.params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function optionalBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new ValidationError(`El campo "${key}" debe ser un booleano`);
  }
  return value;
}

export function stringArray(body: Record<string, unknown>, key: string): string[] {
  const value = body[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new ValidationError(`El campo "${key}" debe ser una lista de textos`);
  }
  for (const item of value) {
    if (typeof item !== "string") {
      throw new ValidationError(`El campo "${key}" solo admite textos`);
    }
  }
  return value.map((item: string) => item.trim()).filter((item) => item.length > 0);
}