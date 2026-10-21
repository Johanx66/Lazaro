import type { PrismaClient } from "../../../generated/prisma/client.js";
import type {
  CompanyRole,
  CompanyUser,
  CreateCompanyUserInput,
  UpdateCompanyUserInput,
} from "../domain/entities/company-user.js";
import type { CompanyUserRepository } from "../domain/repositories/company-user-repository.js";

function toDomain(row: {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  role: CompanyRole;
  active: boolean;
  registeredPhone: string | null;
  companyCustomerId: string | null;
  failedAttempts: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): CompanyUser {
  return { ...row, role: row.role as CompanyRole };
}

export class PrismaCompanyUserRepository implements CompanyUserRepository {
  constructor(private readonly db: PrismaClient) {}

  async findByUsername(username: string): Promise<CompanyUser | null> {
    const row = await this.db.companyUser.findUnique({ where: { username } });
    return row ? toDomain(row) : null;
  }

  async findById(id: string): Promise<CompanyUser | null> {
    const row = await this.db.companyUser.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByCompanyCustomerId(companyCustomerId: string): Promise<CompanyUser | null> {
    const row = await this.db.companyUser.findUnique({ where: { companyCustomerId } });
    return row ? toDomain(row) : null;
  }

  async list(): Promise<CompanyUser[]> {
    const rows = await this.db.companyUser.findMany({ orderBy: { createdAt: "asc" } });
    return rows.map(toDomain);
  }

  async create(input: CreateCompanyUserInput): Promise<CompanyUser> {
    const row = await this.db.companyUser.create({
      data: {
        username: input.username,
        passwordHash: input.passwordHash,
        displayName: input.displayName,
        role: input.role,
        registeredPhone: input.registeredPhone,
        companyCustomerId: input.companyCustomerId ?? null,
      },
    });
    return toDomain(row);
  }

  async update(id: string, input: UpdateCompanyUserInput): Promise<CompanyUser | null> {
    const data: Record<string, string | boolean | null> = {};
    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (input.role !== undefined) data.role = input.role;
    if (input.active !== undefined) data.active = input.active;
    if (input.registeredPhone !== undefined) data.registeredPhone = input.registeredPhone;
    if (input.companyCustomerId !== undefined) data.companyCustomerId = input.companyCustomerId;
    if (input.passwordHash !== undefined) data.passwordHash = input.passwordHash;

    const row = await this.db.companyUser.update({ where: { id }, data });
    return row ? toDomain(row) : null;
  }

  async incrementFailedAttempts(id: string): Promise<number> {
    const updated = await this.db.companyUser.update({
      where: { id },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    });
    return updated.failedAttempts;
  }

  async lockUntil(id: string, until: Date): Promise<void> {
    await this.db.companyUser.update({ where: { id }, data: { lockedUntil: until } });
  }

  async resetFailedAttempts(id: string): Promise<void> {
    await this.db.companyUser.update({
      where: { id },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  }
}
