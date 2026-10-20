import { NotFoundError, ValidationError } from "../../../../shared/errors/app.error.js";
import type { UpdateUserInput, User } from "../../domain/entities/user.js";
import type { UserRepository } from "../../domain/repositories/user-repository.js";
import { validateUpdateUser } from "../validation.js";

export class UpdateUserUseCase {
  constructor(private readonly repository: UserRepository) {}

  async execute(id: string, input: UpdateUserInput): Promise<User> {
    const valid = validateUpdateUser(input);

    if (valid.phone !== undefined && valid.phone !== null) {
      const existingByPhone = await this.repository.findByPhone(valid.phone);
      if (existingByPhone && existingByPhone.id !== id) {
        throw new ValidationError("Ya existe un usuario con ese teléfono", undefined, "PHONE_IN_USE");
      }
    }

    const updated = await this.repository.update(id, valid);
    if (!updated) {
      throw new NotFoundError("Usuario no encontrado");
    }
    return updated;
  }
}