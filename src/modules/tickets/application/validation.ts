import { z } from "zod";
import { ValidationError } from "../../../shared/errors/app.error.js";
import type { CreateTicketInput } from "../domain/entities/ticket.js";

export const createTicketSchema = z.object({
  conversationId: z.string().trim().min(1, "La conversación es obligatoria"),
  userId: z.string().trim().min(1, "El usuario es obligatorio"),
  subject: z
    .string()
    .trim()
    .min(1, "El asunto es obligatorio")
    .max(200, "El asunto no puede superar 200 caracteres"),
  description: z.string().trim().min(1, "La descripción es obligatoria"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
});

export function validateCreateTicket(input: CreateTicketInput): CreateTicketInput {
  const result = createTicketSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues[0]?.message ?? "Datos de ticket inválidos",
      result.error.issues,
    );
  }
  return result.data;
}
