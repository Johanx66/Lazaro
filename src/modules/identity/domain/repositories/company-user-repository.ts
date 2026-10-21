import type {
  CompanyUser,
  CreateCompanyUserInput,
  UpdateCompanyUserInput,
} from "../entities/company-user.js";

/** Puerto de persistencia de usuarios de empresa. `username` siempre normalizado. */
export interface CompanyUserRepository {
  findByUsername(username: string): Promise<CompanyUser | null>;
  findById(id: string): Promise<CompanyUser | null>;
  /** Busca por el código de cliente de la BD de la empresa (único). */
  findByCompanyCustomerId(companyCustomerId: string): Promise<CompanyUser | null>;
  list(): Promise<CompanyUser[]>;
  create(input: CreateCompanyUserInput): Promise<CompanyUser>;
  update(id: string, input: UpdateCompanyUserInput): Promise<CompanyUser | null>;
  /** Incrementa de forma atómica y devuelve el nuevo valor de failedAttempts. */
  incrementFailedAttempts(id: string): Promise<number>;
  lockUntil(id: string, until: Date): Promise<void>;
  /** failedAttempts = 0 y lockedUntil = null. */
  resetFailedAttempts(id: string): Promise<void>;
}
