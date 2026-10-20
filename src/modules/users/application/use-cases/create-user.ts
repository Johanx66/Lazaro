import { ValidationError } from "../../../../shared/errors/app.error.js";
import type { CreateUserInput, User } from "../../domain/entities/user.js";
import type { UserRepository } from "../../domain/repositories/user-repository.js";
import { validateCreateUser } from "../validation.js";

export class CreateUserUseCase {
  constructor(private readonly repository: UserRepository) {}

  async execute(input: CreateUserInput): Promise<User> {
    const valid = validateCreateUser(input);

    const existingByPhone = await this.repository.findByPhone(valid.phone);
    if (existingByPhone) {
      throw new ValidationError("Ya existe un usuario con ese teléfono", undefined, "PHONE_IN_USE");
    }

    return this.repository.create(valid);
  }
}