import { AppError } from "../../../../shared/errors/app.error.js";
import type { PasswordHasher } from "../../../../shared/domain/password-hasher.js";
import type { AuditWriter } from "../../domain/audit.js";
import type { CompanyRole, PublicCompanyUser } from "../../domain/entities/company-user.js";
import { toPublicCompanyUser } from "../../domain/entities/company-user.js";
import type { CompanyUserRepository } from "../../domain/repositories/company-user-repository.js";

export class UsernameTakenError extends AppError {
  constructor() {
    super("USERNAME_TAKEN", "Ya existe un usuario con ese nombre de usuario", 409);
  }
}

export interface CreateCompanyUserDeps {
  repository: CompanyUserRepository;
  hasher: PasswordHasher;
  audit: AuditWriter;
}

export interface CreateCompanyUserCommand {
  username: string;
  password: string;
  displayName: string;
  role: CompanyRole;
  registeredPhone: string | null;
  adminId: string;
  ip?: string | null;
}

export class CreateCompanyUserUseCase {
  constructor(private readonly deps: CreateCompanyUserDeps) {}

  async execute(command: CreateCompanyUserCommand): Promise<PublicCompanyUser> {
    const existing = await this.deps.repository.findByUsername(command.username);
    if (existing) throw new UsernameTakenError();

    const passwordHash = await this.deps.hasher.hash(command.password);
    const created = await this.deps.repository.create({
      username: command.username,
      passwordHash,
      displayName: command.displayName,
      role: command.role,
      registeredPhone: command.registeredPhone,
    });

    await this.deps.audit.record({
      actorType: "ADMIN",
      actorId: command.adminId,
      action: "COMPANY_USER_CREATED",
      targetType: "company_user",
      targetId: created.id,
      ip: command.ip ?? null,
      metadata: { username: created.username, role: created.role },
    });

    return toPublicCompanyUser(created);
  }
}
