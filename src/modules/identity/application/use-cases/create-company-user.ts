import { AppError } from "../../../../shared/errors/app.error.js";
import type { PasswordHasher } from "../../../../shared/domain/password-hasher.js";
import type { AuditWriter } from "../../domain/audit.js";
import { DEFAULT_COMPANY_CUSTOMER_ID_PATTERN } from "../../domain/customer-code.js";
import type { CompanyRole, PublicCompanyUser } from "../../domain/entities/company-user.js";
import { toPublicCompanyUser } from "../../domain/entities/company-user.js";
import type { CompanyUserRepository } from "../../domain/repositories/company-user-repository.js";
import { resolveCompanyCustomerId } from "../company-customer-code.js";

export class UsernameTakenError extends AppError {
  constructor() {
    super("USERNAME_TAKEN", "Ya existe un usuario con ese nombre de usuario", 409);
  }
}

export interface CreateCompanyUserDeps {
  repository: CompanyUserRepository;
  hasher: PasswordHasher;
  audit: AuditWriter;
  /** Patrón de validación del código de cliente en la BD de la empresa. */
  companyCustomerIdPattern?: string;
}

export interface CreateCompanyUserCommand {
  username: string;
  password: string;
  displayName: string;
  role: CompanyRole;
  registeredPhone: string | null;
  /**
   * Código de cliente en la BD de la empresa (p. ej. "CLI-000123"). Lo asigna un
   * ADMIN. Si es null o vacío, el usuario queda sin vincular y sus consultas de
   * datos se deniegan.
   */
  companyCustomerId?: string | null;
  adminId: string;
  ip?: string | null;
}

export class CreateCompanyUserUseCase {
  constructor(private readonly deps: CreateCompanyUserDeps) {}

  async execute(command: CreateCompanyUserCommand): Promise<PublicCompanyUser> {
    const existing = await this.deps.repository.findByUsername(command.username);
    if (existing) throw new UsernameTakenError();

    const rawCustomerId = command.companyCustomerId ?? null;
    const companyCustomerId =
      rawCustomerId !== null && rawCustomerId.trim().length > 0
        ? await resolveCompanyCustomerId(
            rawCustomerId,
            "",
            this.deps.repository,
            this.deps.companyCustomerIdPattern ?? DEFAULT_COMPANY_CUSTOMER_ID_PATTERN,
          )
        : null;

    const passwordHash = await this.deps.hasher.hash(command.password);
    const created = await this.deps.repository.create({
      username: command.username,
      passwordHash,
      displayName: command.displayName,
      role: command.role,
      registeredPhone: command.registeredPhone,
      companyCustomerId,
    });

    await this.deps.audit.record({
      actorType: "ADMIN",
      actorId: command.adminId,
      action: "COMPANY_USER_CREATED",
      targetType: "company_user",
      targetId: created.id,
      ip: command.ip ?? null,
      metadata: {
        username: created.username,
        role: created.role,
        // Se registra QUE se asignó un código, no su valor: el código ya es
        // visible en el panel y no se duplica en la auditoría.
        companyCustomerIdAssigned: companyCustomerId !== null,
      },
    });

    return toPublicCompanyUser(created);
  }
}
