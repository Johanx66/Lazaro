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

/** El código de cliente ya está asignado a otro usuario de empresa. */
export class CompanyCustomerIdTakenError extends AppError {
  constructor() {
    super(
      "COMPANY_CUSTOMER_ID_TAKEN",
      "Ese código de cliente ya está asignado a otro usuario",
      409,
    );
  }
}

/** El código de cliente no cumple el formato configurado. */
export class InvalidCompanyCustomerIdError extends AppError {
  constructor(message: string) {
    super("INVALID_COMPANY_CUSTOMER_ID", message, 400);
  }
}
