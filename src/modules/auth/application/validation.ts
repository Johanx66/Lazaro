import { z } from "zod";
import { ValidationError } from "../../../shared/errors/app.error.js";

const MAX_EMAIL_LENGTH = 254;
// Tope para no pasar entradas enormes a argon2 (el cuerpo ya está limitado a 1 MB).
const MAX_PASSWORD_LENGTH = 1024;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(MAX_EMAIL_LENGTH).pipe(z.email()),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

export type LoginInput = z.infer<typeof loginSchema>;

export function parseLoginBody(body: unknown): LoginInput {
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    // Mensaje fijo: no se devuelven los valores recibidos ni el detalle de zod.
    throw new ValidationError("Debes enviar un email y una contraseña válidos");
  }
  return parsed.data;
}
