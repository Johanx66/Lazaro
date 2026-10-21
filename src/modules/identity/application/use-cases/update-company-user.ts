import { NotFoundError } from "../../../../shared/errors/app.error.js";
import type { PasswordHasher } from "../../../../shared/domain/password-hasher.js";
import type { ChatSessionService } from "../chat-session-service.js";
import type { AuditWriter } from "../../domain/audit.js";
import type { CompanyRole, PublicCompanyUser } from "../../domain/entities/company-user.js";
import { toPublicCompanyUser } from "../../domain/entities/company-user.js";
import type { CompanyUserRepository } from "../../domain/repositories/company-user-repository.js";

export interface UpdateCompanyUserDeps {
  repository: CompanyUserRepository;
  hasher: PasswordHasher;
  audit: AuditWriter;
  /** Necesario para revocar las sesiones abiertas cuando cambia el teléfono. */
  sessions: ChatSessionService;
}

export interface UpdateCompanyUserCommand {
  id: string;
  displayName?: string;
  role?: CompanyRole;
  active?: boolean;
  registeredPhone?: string | null;
  /** Si se indica, se re-hashea. Nunca se guarda en claro. */
  password?: string;
  adminId: string;
  ip?: string | null;
}

export class UpdateCompanyUserUseCase {
  constructor(private readonly deps: UpdateCompanyUserDeps) {}

  async execute(command: UpdateCompanyUserCommand): Promise<PublicCompanyUser> {
    const current = await this.deps.repository.findById(command.id);
    if (!current) throw new NotFoundError("Usuario no encontrado", "USER_NOT_FOUND");

    const data: {
      displayName?: string;
      role?: CompanyRole;
      active?: boolean;
      registeredPhone?: string | null;
      passwordHash?: string;
    } = {};
    if (command.displayName !== undefined) data.displayName = command.displayName;
    if (command.role !== undefined) data.role = command.role;
    if (command.active !== undefined) data.active = command.active;
    if (command.registeredPhone !== undefined) data.registeredPhone = command.registeredPhone;
    if (command.password !== undefined) data.passwordHash = await this.deps.hasher.hash(command.password);

    // Si cambia el teléfono registrado se revocan las sesiones abiertas ANTES de
    // guardar: el contacto anterior no debe poder seguir usando la sesión y el
    // cliente debe volver a verificarse. Si la actualización falla después, el
    // único efecto es que el cliente tenga que verificarse otra vez.
    const phoneChanged =
      command.registeredPhone !== undefined && command.registeredPhone !== current.registeredPhone;
    if (phoneChanged) {
      const revoked = await this.deps.sessions.revokeByCompanyUser(current.id);
      await this.deps.audit.record({
        actorType: "ADMIN",
        actorId: command.adminId,
        action: "CHAT_SESSIONS_REVOKED",
        targetType: "company_user",
        targetId: current.id,
        ip: command.ip ?? null,
        metadata: { reason: "registeredPhone_changed", sessionsRevoked: revoked },
      });
    }

    const updated = await this.deps.repository.update(command.id, data);
    if (!updated) throw new NotFoundError("Usuario no encontrado", "USER_NOT_FOUND");

    await this.deps.audit.record({
      actorType: "ADMIN",
      actorId: command.adminId,
      action: updated.active ? "COMPANY_USER_UPDATED" : "COMPANY_USER_DEACTIVATED",
      targetType: "company_user",
      targetId: updated.id,
      ip: command.ip ?? null,
      metadata: {
        fields: Object.keys(data),
        role: updated.role,
        active: updated.active,
      },
    });

    return toPublicCompanyUser(updated);
  }
}
