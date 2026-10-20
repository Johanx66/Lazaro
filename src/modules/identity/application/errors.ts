import { AppError } from "../../../shared/errors/app.error.js";
import { INVALID_CREDENTIALS_MESSAGE, INVALID_LINK_MESSAGE } from "./policy.js";

/** Error único para todos los fallos de login de chat: no revela si el usuario o el enlace existen. */
export class ChatInvalidCredentialsError extends AppError {
  constructor() {
    super("INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE, 401);
  }
}

/** Enlace de login inválido, vencido o ya usado. */
export class InvalidLoginLinkError extends AppError {
  constructor() {
    super("INVALID_LINK", INVALID_LINK_MESSAGE, 404);
  }
}
