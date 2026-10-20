import type { PublicCompanyUser } from "../../domain/entities/company-user.js";
import { toPublicCompanyUser } from "../../domain/entities/company-user.js";
import type { CompanyUserRepository } from "../../domain/repositories/company-user-repository.js";

export interface ListCompanyUsersDeps {
  repository: CompanyUserRepository;
}

export class ListCompanyUsersUseCase {
  constructor(private readonly deps: ListCompanyUsersDeps) {}

  async execute(): Promise<PublicCompanyUser[]> {
    const users = await this.deps.repository.list();
    return users.map(toPublicCompanyUser);
  }
}
