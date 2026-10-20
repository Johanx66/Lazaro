import type { Request, Response } from "express";
import { param } from "../../../shared/http/request.js";
import type { CreateUserUseCase } from "../application/use-cases/create-user.js";
import type { FindUserByPhoneUseCase } from "../application/use-cases/find-user-by-phone.js";
import type { GetUserUseCase } from "../application/use-cases/get-user.js";
import type { UpdateUserUseCase } from "../application/use-cases/update-user.js";
import { toCreateUserInput, toUpdateUserInput } from "./user-dtos.js";

export interface UserControllerDeps {
  createUser: CreateUserUseCase;
  getUser: GetUserUseCase;
  findUserByPhone: FindUserByPhoneUseCase;
  updateUser: UpdateUserUseCase;
}

export class UserController {
  constructor(private readonly deps: UserControllerDeps) {}

  async create(req: Request, res: Response): Promise<void> {
    const input = toCreateUserInput((req.body ?? {}) as Record<string, unknown>);
    const user = await this.deps.createUser.execute(input);
    res.status(201).json(user);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const user = await this.deps.getUser.execute(param(req, "id"));
    res.json(user);
  }

  async getByPhone(req: Request, res: Response): Promise<void> {
    const user = await this.deps.findUserByPhone.execute(param(req, "phone"));
    res.json(user);
  }

  async update(req: Request, res: Response): Promise<void> {
    const input = toUpdateUserInput((req.body ?? {}) as Record<string, unknown>);
    const user = await this.deps.updateUser.execute(param(req, "id"), input);
    res.json(user);
  }
}