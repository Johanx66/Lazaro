import type { Request, Response } from "express";
import { param } from "../../../shared/http/request.js";
import type { CreateCompanyUserUseCase } from "../application/use-cases/create-company-user.js";
import type { ListCompanyUsersUseCase } from "../application/use-cases/list-company-users.js";
import type { UpdateCompanyUserUseCase } from "../application/use-cases/update-company-user.js";
import {
  parseCreateCompanyUserBody,
  parseUpdateCompanyUserBody,
} from "../application/validation.js";
import { clientIp, requireAdminId } from "./principal.js";

export interface CompanyUserControllerDeps {
  createCompanyUser: CreateCompanyUserUseCase;
  listCompanyUsers: ListCompanyUsersUseCase;
  updateCompanyUser: UpdateCompanyUserUseCase;
}

export class CompanyUserController {
  constructor(private readonly deps: CompanyUserControllerDeps) {}

  async list(_req: Request, res: Response): Promise<void> {
    res.json(await this.deps.listCompanyUsers.execute());
  }

  async create(req: Request, res: Response): Promise<void> {
    const body = parseCreateCompanyUserBody(req.body);
    const created = await this.deps.createCompanyUser.execute({
      username: body.username,
      password: body.password,
      displayName: body.displayName,
      role: body.role ?? "USER",
      registeredPhone: body.registeredPhone ?? null,
      companyCustomerId: body.companyCustomerId ?? null,
      adminId: requireAdminId(req),
      ip: clientIp(req),
    });
    res.status(201).json(created);
  }

  async update(req: Request, res: Response): Promise<void> {
    const body = parseUpdateCompanyUserBody(req.body);
    const updated = await this.deps.updateCompanyUser.execute({
      id: param(req, "id"),
      ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
      ...(body.role !== undefined ? { role: body.role } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
      ...(body.registeredPhone !== undefined ? { registeredPhone: body.registeredPhone } : {}),
      ...(body.companyCustomerId !== undefined
        ? { companyCustomerId: body.companyCustomerId === "" ? null : body.companyCustomerId }
        : {}),
      ...(body.password !== undefined ? { password: body.password } : {}),
      adminId: requireAdminId(req),
      ip: clientIp(req),
    });
    res.json(updated);
  }
}
