import type { Express } from "express";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { PrismaUserRepository } from "./infrastructure/prisma-user-repository.js";
import { UserController } from "./presentation/user-controller.js";
import { userRoutes } from "./presentation/user-routes.js";
import { CreateUserUseCase } from "./application/use-cases/create-user.js";
import { FindUserByPhoneUseCase } from "./application/use-cases/find-user-by-phone.js";
import { GetUserUseCase } from "./application/use-cases/get-user.js";
import { UpdateUserUseCase } from "./application/use-cases/update-user.js";

export function wireUsers(app: Express, db: PrismaClient): void {
  const repository = new PrismaUserRepository(db);
  const controller = new UserController({
    createUser: new CreateUserUseCase(repository),
    getUser: new GetUserUseCase(repository),
    findUserByPhone: new FindUserByPhoneUseCase(repository),
    updateUser: new UpdateUserUseCase(repository),
  });
  app.use("/api/users", userRoutes(controller));
}