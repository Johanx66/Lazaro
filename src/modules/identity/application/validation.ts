import { z } from "zod";
import { ValidationError } from "../../../shared/errors/app.error.js";

// Tope para no pasar entradas enormes a argon2 (el cuerpo ya está limitado a 1 MB).
const MAX_PASSWORD_LENGTH = 1024;
const MIN_PASSWORD_LENGTH = 12;
const MAX_USERNAME_LENGTH = 60;
const MAX_DISPLAY_NAME_LENGTH = 120;

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(MAX_USERNAME_LENGTH)
  .regex(/^[a-z0-9._-]+$/, "solo minúsculas, dígitos, punto, guion y guion bajo");

const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH);

export const chatLoginSchema = z.object({
  token: z.string().min(1).max(200),
  username: usernameSchema,
  password: passwordSchema,
});

export type ChatLoginInput = z.infer<typeof chatLoginSchema>;

export function parseChatLoginBody(body: unknown): ChatLoginInput {
  const parsed = chatLoginSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("Debes enviar un usuario y una contraseña válidos");
  }
  return parsed.data;
}

export const createCompanyUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(MAX_DISPLAY_NAME_LENGTH),
  role: z.enum(["USER", "ADMIN"]).optional(),
  registeredPhone: z.string().trim().max(40).nullable().optional(),
  // Código de cliente en la BD de la empresa. Vacío/null => sin vincular.
  // El formato exacto se valida en el caso de uso con el patrón configurado.
  companyCustomerId: z.string().trim().max(64).nullable().optional(),
});

export type CreateCompanyUserBody = z.infer<typeof createCompanyUserSchema>;

export function parseCreateCompanyUserBody(body: unknown): CreateCompanyUserBody {
  const parsed = createCompanyUserSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      "Datos de usuario inválidos: revisa usuario, contraseña (mínimo 12) y nombre",
    );
  }
  return parsed.data;
}

export const updateCompanyUserSchema = z
  .object({
    password: passwordSchema.optional(),
    displayName: z.string().trim().min(1).max(MAX_DISPLAY_NAME_LENGTH).optional(),
    role: z.enum(["USER", "ADMIN"]).optional(),
    active: z.boolean().optional(),
    registeredPhone: z.string().trim().max(40).nullable().optional(),
    // Código de cliente en la BD de la empresa. `null` o "" => quitar el vínculo.
    // El formato exacto se valida en el caso de uso con el patrón configurado.
    companyCustomerId: z.string().trim().max(64).nullable().optional(),
  })
  .strict();

export type UpdateCompanyUserBody = z.infer<typeof updateCompanyUserSchema>;

export function parseUpdateCompanyUserBody(body: unknown): UpdateCompanyUserBody {
  const parsed = updateCompanyUserSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("Datos de usuario inválidos");
  }
  return parsed.data;
}
